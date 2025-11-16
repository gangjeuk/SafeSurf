// FIX: change throw Error into recoverable codes. See https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph#handle-errors-appropriately
import { Actors, ExecutionState } from '../../event/types';
import { wrapUntrustedContent } from '../../messages/utils';
import { ActionResult } from '../../types';
import { t } from '@extension/i18n';
import { createLogger } from '@src/background/log';
import { tool } from 'langchain';
import { z } from 'zod';
import type { agentContextSchema, agentStateSchema } from '../../types';
import type { ToolRuntime } from 'langchain';

const logger = createLogger('Actions');

export const doneTool = tool(
  (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const msg = input.text;
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      'done',
      options.context,
      options.state,
    );
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg,
      options.context,
      options.state,
    );
    options.state.results.push(
      new ActionResult({
        isDone: true,
        extractedContent: msg,
      }),
    );
  },
  {
    name: 'done',
    description: 'Complete task',
    schema: z.object({
      text: z.string(),
      success: z.boolean(),
    }),
  },
);

/** Begin - Basic Navigation Actions */
export const searchGoogleTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    // TODO: This tool needs access to an LLM to rank search results.
    // The current architecture does not provide an LLM to tools.
    // This is a placeholder implementation.
    const intent = input.intent || t('act_searchGoogle_start', [input.query]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );

    await options.context.browserContext.navigateTo(`https://www.google.com/search?q=${input.query}`);

    const msg = t('act_searchGoogle_ok', [input.query, '']);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg,
      options.context,
      options.state,
    );
    options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
  },
  {
    name: 'search_google',
    description:
      'Search the query in Google in the current tab, the query should be a search query like humans search in Google, concrete and not vague or super long. More the single most important items.',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      query: z.string(),
      goal: z.string(),
    }),
  },
);

export const goToUrlTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const msg1 = input.intent || t('act_goToUrl_start', [input.url]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      msg1,
      options.context,
      options.state,
    );

    await options.context.browserContext.navigateTo(input.url);

    const msg2 = t('act_goToUrl_ok', [input.url]);

    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg2,
      options.context,
      options.state,
    );

    options.state.results.push(new ActionResult({ extractedContent: msg2, includeInMemory: true }));
  },

  {
    name: 'go_to_url',
    description: 'Navigate to URL in the current tab',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      url: z.string(),
    }),
  },
);

export const goBackTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_goBack_start');
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );

    const page = await options.context.browserContext.getCurrentPage();
    await page.goBack();
    const msg2 = t('act_goBack_ok');
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg2,
      options.context,
      options.state,
    );
    options.state.results.push(new ActionResult({ extractedContent: msg2, includeInMemory: true }));
  },
  {
    name: 'go_back',
    description: 'Go back to the previous page',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
    }),
  },
);

export const clickElementTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_click_start', [input.index.toString()]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );

    const page = await options.context.browserContext.getCurrentPage();
    const state = await page.getState();

    const elementNode = state?.selectorMap.get(input.index);
    if (!elementNode) {
      throw new Error(t('act_errors_elementNotExist', [input.index.toString()]));
    }

    if (page.isFileUploader(elementNode)) {
      const msg = t('act_click_fileUploader', [input.index.toString()]);
      logger.info(msg);
      options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
      return;
    }

    try {
      const initialTabIds = await options.context.browserContext.getAllTabIds();
      await page.clickElementNode(options.context.useVision, elementNode);
      let msg = t('act_click_ok', [input.index.toString(), elementNode.getAllTextTillNextClickableElement(2)]);
      logger.info(msg);

      // TODO: could be optimized by chrome extension tab api
      const currentTabIds = await options.context.browserContext.getAllTabIds();
      if (currentTabIds.size > initialTabIds.size) {
        const newTabMsg = t('act_click_newTabOpened');
        msg += ` - ${newTabMsg}`;
        logger.info(newTabMsg);
        const newTabId = Array.from(currentTabIds).find(id => !initialTabIds.has(id));
        if (newTabId) {
          await options.context.browserContext.switchTab(newTabId);
        }
      }
      options.context.eventContext.emitAgentEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_OK,
        msg,
        options.context,
        options.state,
      );
      options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
    } catch (error) {
      const msg = t('act_errors_elementNoLongerAvailable', [input.index.toString()]);
      options.context.eventContext.emitAgentEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_FAIL,
        msg,
        options.context,
        options.state,
      );
      options.state.results.push(
        new ActionResult({
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  },
  {
    name: 'click_element',
    description: 'Click element by index',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      index: z.number().int().describe('index of the element'),
      xpath: z.string().nullable().optional().describe('xpath of the element'),
    }),
  },
);

export const inputTextTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_inputText_start', [input.index.toString()]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );

    const page = await options.context.browserContext.getCurrentPage();
    const state = await page.getState();

    const elementNode = state?.selectorMap.get(input.index);
    if (!elementNode) {
      throw new Error(t('act_errors_elementNotExist', [input.index.toString()]));
    }

    await page.inputTextElementNode(options.context.useVision, elementNode, input.text);
    const msg = t('act_inputText_ok', [input.text, input.index.toString()]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg,
      options.context,
      options.state,
    );
    options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
  },
  {
    name: 'input_text',
    description: 'Input text into an interactive input element',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      index: z.number().int().describe('index of the element'),
      text: z.string().describe('text to input'),
      xpath: z.string().nullable().optional().describe('xpath of the element'),
    }),
  },
);
// END - Basic Navigation Actions

// BEGIN - Tab Management Actions
export const switchTabTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_switchTab_start', [input.tab_id.toString()]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );
    await options.context.browserContext.switchTab(input.tab_id);
    const msg = t('act_switchTab_ok', [input.tab_id.toString()]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg,
      options.context,
      options.state,
    );
    options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
  },
  {
    name: 'switch_tab',
    description: 'Switch to tab by tab id',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      tab_id: z.number().int().describe('id of the tab to switch to'),
    }),
  },
);

export const openTabTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_openTab_start', [input.url]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );
    await options.context.browserContext.openTab(input.url);
    const msg = t('act_openTab_ok', [input.url]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg,
      options.context,
      options.state,
    );
    options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
  },
  {
    name: 'open_tab',
    description: 'Open URL in new tab',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      url: z.string().describe('url to open'),
    }),
  },
);

export const closeTabTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_closeTab_start', [input.tab_id.toString()]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );
    await options.context.browserContext.closeTab(input.tab_id);
    const msg = t('act_closeTab_ok', [input.tab_id.toString()]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg,
      options.context,
      options.state,
    );
    options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
  },
  {
    name: 'close_tab',
    description: 'Close tab by tab id',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      tab_id: z.number().int().describe('id of the tab'),
    }),
  },
);

// END - Tab Management Actions

// BEGIN - Cache Actions
export const cacheContentTool = tool(
  (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_cache_start', [input.content]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );

    const rawMsg = t('act_cache_ok', [input.content]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      rawMsg,
      options.context,
      options.state,
    );

    const msg = wrapUntrustedContent(rawMsg);
    options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
  },
  {
    name: 'cache_content',
    description: 'Cache what you have found so far from the current page for future use',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      content: z.string().default('').describe('content to cache'),
    }),
  },
);

export const scrollToPercentTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_scrollToPercent_start');
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );
    const page = await options.context.browserContext.getCurrentPage();

    if (input.index) {
      const state = page.getCachedState();
      const elementNode = state?.selectorMap.get(input.index);
      if (!elementNode) {
        const errorMsg = t('act_errors_elementNotExist', [input.index.toString()]);
        options.context.eventContext.emitAgentEvent(
          Actors.NAVIGATOR,
          ExecutionState.ACT_FAIL,
          errorMsg,
          options.context,
          options.state,
        );
        options.state.results.push(new ActionResult({ error: errorMsg, includeInMemory: true }));
        return;
      }
      logger.info(`Scrolling to percent: ${input.yPercent} with elementNode: ${elementNode.xpath}`);
      await page.scrollToPercent(input.yPercent, elementNode);
    } else {
      await page.scrollToPercent(input.yPercent);
    }
    const msg = t('act_scrollToPercent_ok', [input.yPercent.toString()]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg,
      options.context,
      options.state,
    );
    options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
  },
  {
    name: 'scroll_to_percent',
    description:
      'Scrolls to a particular vertical percentage of the document or an element. If no index of element is specified, scroll the whole document.',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      yPercent: z.number().int().describe('percentage to scroll to - min 0, max 100; 0 is top, 100 is bottom'),
      index: z.number().int().nullable().optional().describe('index of the element'),
    }),
  },
);

export const scrollToTopTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_scrollToTop_start');
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );
    const page = await options.context.browserContext.getCurrentPage();
    if (input.index) {
      const state = page.getCachedState();
      const elementNode = state?.selectorMap.get(input.index);
      if (!elementNode) {
        const errorMsg = t('act_errors_elementNotExist', [input.index.toString()]);
        options.context.eventContext.emitAgentEvent(
          Actors.NAVIGATOR,
          ExecutionState.ACT_FAIL,
          errorMsg,
          options.context,
          options.state,
        );
        options.state.results.push(new ActionResult({ error: errorMsg, includeInMemory: true }));
        return;
      }
      await page.scrollToPercent(0, elementNode);
    } else {
      await page.scrollToPercent(0);
    }
    const msg = t('act_scrollToTop_ok');
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg,
      options.context,
      options.state,
    );
    options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
  },
  {
    name: 'scroll_to_top',
    description: 'Scroll the document in the window or an element to the top',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      index: z.number().int().nullable().optional().describe('index of the element'),
    }),
  },
);

export const scrollToBottomTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_scrollToBottom_start');
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );
    const page = await options.context.browserContext.getCurrentPage();
    if (input.index) {
      const state = await page.getCachedState();
      const elementNode = state?.selectorMap.get(input.index);
      if (!elementNode) {
        const errorMsg = t('act_errors_elementNotExist', [input.index.toString()]);
        options.context.eventContext.emitAgentEvent(
          Actors.NAVIGATOR,
          ExecutionState.ACT_FAIL,
          errorMsg,
          options.context,
          options.state,
        );
        options.state.results.push(new ActionResult({ error: errorMsg, includeInMemory: true }));
        return;
      }
      await page.scrollToPercent(100, elementNode);
    } else {
      await page.scrollToPercent(100);
    }
    const msg = t('act_scrollToBottom_ok');
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg,
      options.context,
      options.state,
    );
    options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
  },
  {
    name: 'scroll_to_bottom',
    description: 'Scroll the document in the window or an element to the bottom',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      index: z.number().int().nullable().optional().describe('index of the element'),
    }),
  },
);

export const previousPageTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_previousPage_start');
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );
    const page = await options.context.browserContext.getCurrentPage();

    if (input.index) {
      const state = page.getCachedState();
      const elementNode = state?.selectorMap.get(input.index);
      if (!elementNode) {
        const errorMsg = t('act_errors_elementNotExist', [input.index.toString()]);
        options.context.eventContext.emitAgentEvent(
          Actors.NAVIGATOR,
          ExecutionState.ACT_FAIL,
          errorMsg,
          options.context,
          options.state,
        );
        options.state.results.push(new ActionResult({ error: errorMsg, includeInMemory: true }));
        return;
      }

      try {
        const [elementScrollTop] = await page.getElementScrollInfo(elementNode);
        if (elementScrollTop === 0) {
          const msg = t('act_errors_alreadyAtTop', [input.index.toString()]);
          options.context.eventContext.emitAgentEvent(
            Actors.NAVIGATOR,
            ExecutionState.ACT_OK,
            msg,
            options.context,
            options.state,
          );
          options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
          return;
        }
      } catch (error) {
        logger.warning(`Could not get element scroll info: ${error instanceof Error ? error.message : String(error)}`);
      }

      await page.scrollToPreviousPage(elementNode);
    } else {
      // Check if page is already at top
      const [initialScrollY] = await page.getScrollInfo();
      if (initialScrollY === 0) {
        const msg = t('act_errors_pageAlreadyAtTop');
        options.context.eventContext.emitAgentEvent(
          Actors.NAVIGATOR,
          ExecutionState.ACT_OK,
          msg,
          options.context,
          options.state,
        );
        options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
        return;
      }

      await page.scrollToPreviousPage();
    }
    const msg = t('act_previousPage_ok');
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg,
      options.context,
      options.state,
    );
    options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
  },
  {
    name: 'previous_page',
    description:
      'Scroll the document in the window or an element to the previous page. If no index is specified, scroll the whole document.',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      index: z.number().int().nullable().optional().describe('index of the element'),
    }),
  },
);

export const nextPageTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_nextPage_start');
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );
    const page = await options.context.browserContext.getCurrentPage();

    if (input.index) {
      const state = await page.getCachedState();
      const elementNode = state?.selectorMap.get(input.index);
      if (!elementNode) {
        const errorMsg = t('act_errors_elementNotExist', [input.index.toString()]);
        options.context.eventContext.emitAgentEvent(
          Actors.NAVIGATOR,
          ExecutionState.ACT_FAIL,
          errorMsg,
          options.context,
          options.state,
        );
        options.state.results.push(new ActionResult({ error: errorMsg, includeInMemory: true }));
        return;
      }

      // Check if element is already at bottom of its scrollable area
      try {
        const [elementScrollTop, elementClientHeight, elementScrollHeight] =
          await page.getElementScrollInfo(elementNode);
        if (elementScrollTop + elementClientHeight >= elementScrollHeight) {
          const msg = t('act_errors_alreadyAtBottom', [input.index.toString()]);
          options.context.eventContext.emitAgentEvent(
            Actors.NAVIGATOR,
            ExecutionState.ACT_OK,
            msg,
            options.context,
            options.state,
          );
          options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
          return;
        }
      } catch (error) {
        // If we can't get scroll info, let the scrollToNextPage method handle it
        logger.warning(`Could not get element scroll info: ${error instanceof Error ? error.message : String(error)}`);
      }

      await page.scrollToNextPage(elementNode);
    } else {
      // Check if page is already at bottom
      const [initialScrollY, initialVisualViewportHeight, initialScrollHeight] = await page.getScrollInfo();
      if (initialScrollY + initialVisualViewportHeight >= initialScrollHeight) {
        const msg = t('act_errors_pageAlreadyAtBottom');
        options.context.eventContext.emitAgentEvent(
          Actors.NAVIGATOR,
          ExecutionState.ACT_OK,
          msg,
          options.context,
          options.state,
        );
        options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
        return;
      }

      await page.scrollToNextPage();
    }
    const msg = t('act_nextPage_ok');
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg,
      options.context,
      options.state,
    );
    options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
  },
  {
    name: 'next_page',
    description:
      'Scroll the document in the window or an element to the next page. If no index is specified, scroll the whole document.',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      index: z.number().int().nullable().optional().describe('index of the element'),
    }),
  },
);

export const scrollToTextTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_scrollToText_start', [input.text, input.nth.toString()]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );

    const page = await options.context.browserContext.getCurrentPage();
    try {
      const scrolled = await page.scrollToText(input.text, input.nth);
      const msg = scrolled
        ? t('act_scrollToText_ok', [input.text, input.nth.toString()])
        : t('act_scrollToText_notFound', [input.text, input.nth.toString()]);
      options.context.eventContext.emitAgentEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_OK,
        msg,
        options.context,
        options.state,
      );
      options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
    } catch (error) {
      const msg = t('act_scrollToText_failed', [error instanceof Error ? error.message : String(error)]);
      options.context.eventContext.emitAgentEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_FAIL,
        msg,
        options.context,
        options.state,
      );
      options.state.results.push(new ActionResult({ error: msg, includeInMemory: true }));
    }
  },
  {
    name: 'scroll_to_text',
    description: 'If you dont find something which you want to interact with in current viewport, try to scroll to it',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      text: z.string().describe('text to scroll to'),
      nth: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe('which occurrence of the text to scroll to (1-indexed, default: 1)'),
    }),
  },
);

export const sendKeysTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_sendKeys_start', [input.keys]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );

    const page = await options.context.browserContext.getCurrentPage();
    await page.sendKeys(input.keys);
    const msg = t('act_sendKeys_ok', [input.keys]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg,
      options.context,
      options.state,
    );
    options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
  },
  {
    name: 'send_keys',
    description:
      'Send strings of special keys like Backspace, Insert, PageDown, Delete, Enter. Shortcuts such as `Control+o`, `Control+Shift+T` are supported as well. This gets used in keyboard press. Be aware of different operating systems and their shortcuts',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      keys: z.string().describe('keys to send'),
    }),
  },
);

// Get all options from a native dropdown
export const getDropdownOptionsTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_getDropdownOptions_start', [input.index.toString()]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );

    const page = await options.context.browserContext.getCurrentPage();
    const state = await page.getState();

    const elementNode = state?.selectorMap.get(input.index);
    if (!elementNode) {
      const errorMsg = t('act_errors_elementNotExist', [input.index.toString()]);
      options.context.eventContext.emitAgentEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_FAIL,
        errorMsg,
        options.context,
        options.state,
      );
      options.state.results.push(
        new ActionResult({
          error: errorMsg,
          includeInMemory: true,
        }),
      );
      return;
    }

    try {
      // Use the existing getDropdownOptions method
      const optionsList = await page.getDropdownOptions(input.index);

      if (optionsList && optionsList.length > 0) {
        // Format options for display
        const formattedOptions: string[] = optionsList.map(opt => {
          // Encoding ensures AI uses the exact string in select_dropdown_option
          const encodedText = JSON.stringify(opt.text);
          return `${opt.index}: text=${encodedText}`;
        });

        // This code should not be reached as getDropdownOptions throws an error when no options found
        // But keeping as fallback
        let msg = formattedOptions.join('\n');
        msg += '\n' + t('act_getDropdownOptions_useExactText');
        options.context.eventContext.emitAgentEvent(
          Actors.NAVIGATOR,
          ExecutionState.ACT_OK,
          t('act_getDropdownOptions_ok', [optionsList.length.toString()]),
          options.context,
          options.state,
        );
        options.state.results.push(
          new ActionResult({
            extractedContent: msg,
            includeInMemory: true,
          }),
        );
      } else {
        const msg = t('act_getDropdownOptions_noOptions');
        options.context.eventContext.emitAgentEvent(
          Actors.NAVIGATOR,
          ExecutionState.ACT_OK,
          msg,
          options.context,
          options.state,
        );
        options.state.results.push(
          new ActionResult({
            extractedContent: msg,
            includeInMemory: true,
          }),
        );
      }
    } catch (error) {
      const errorMsg = t('act_getDropdownOptions_failed', [error instanceof Error ? error.message : String(error)]);
      options.context.eventContext.emitAgentEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_FAIL,
        errorMsg,
        options.context,
        options.state,
      );
      options.state.results.push(
        new ActionResult({
          error: errorMsg,
          includeInMemory: true,
        }),
      );
    }
  },
  {
    name: 'get_dropdown_options',
    description: 'Get all options from a native dropdown',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      index: z.number().int().describe('index of the dropdown element'),
    }),
  },
);

export const selectDropdownOptionTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const intent = input.intent || t('act_selectDropdownOption_start', [input.text, input.index.toString()]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );

    const page = await options.context.browserContext.getCurrentPage();
    const state = await page.getState();

    const elementNode = state?.selectorMap.get(input.index);
    if (!elementNode) {
      const errorMsg = t('act_errors_elementNotExist', [input.index.toString()]);
      options.context.eventContext.emitAgentEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_FAIL,
        errorMsg,
        options.context,
        options.state,
      );
      options.state.results.push(
        new ActionResult({
          error: errorMsg,
          includeInMemory: true,
        }),
      );
      return;
    }

    if (!elementNode.tagName || elementNode.tagName.toLowerCase() !== 'select') {
      const errorMsg = t('act_selectDropdownOption_notSelect', [
        input.index.toString(),
        elementNode.tagName || 'unknown',
      ]);
      options.context.eventContext.emitAgentEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_FAIL,
        errorMsg,
        options.context,
        options.state,
      );
      options.state.results.push(
        new ActionResult({
          error: errorMsg,
          includeInMemory: true,
        }),
      );
      return;
    }

    logger.debug(`Attempting to select '${input.text}' using xpath: ${elementNode.xpath}`);

    try {
      const result = await page.selectDropdownOption(input.index, input.text);
      const msg = t('act_selectDropdownOption_ok', [input.text, input.index.toString()]);
      options.context.eventContext.emitAgentEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_OK,
        msg,
        options.context,
        options.state,
      );
      options.state.results.push(
        new ActionResult({
          extractedContent: result,
          includeInMemory: true,
        }),
      );
    } catch (error) {
      const errorMsg = t('act_selectDropdownOption_failed', [error instanceof Error ? error.message : String(error)]);
      options.context.eventContext.emitAgentEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_FAIL,
        errorMsg,
        options.context,
        options.state,
      );
      options.state.results.push(
        new ActionResult({
          error: errorMsg,
          includeInMemory: true,
        }),
      );
    }
  },
  {
    name: 'select_dropdown_option',
    description: 'Select dropdown option for interactive element index by the text of the option you want to select',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      index: z.number().int().describe('index of the dropdown element'),
      text: z.string().describe('text of the option'),
    }),
  },
);

export const waitTool = tool(
  async (input, options: ToolRuntime<typeof agentStateSchema, typeof agentContextSchema>) => {
    const seconds = input.seconds || 3;
    const intent = input.intent || t('act_wait_start', [seconds.toString()]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_START,
      intent,
      options.context,
      options.state,
    );
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    const msg = t('act_wait_ok', [seconds.toString()]);
    options.context.eventContext.emitAgentEvent(
      Actors.NAVIGATOR,
      ExecutionState.ACT_OK,
      msg,
      options.context,
      options.state,
    );
    options.state.results.push(new ActionResult({ extractedContent: msg, includeInMemory: true }));
  },
  {
    name: 'wait',
    description: 'Wait for x seconds default 3, do NOT use this action unless user asks to wait explicitly',
    schema: z.object({
      intent: z.string().default('').describe('purpose of this action'),
      seconds: z.number().int().default(3).describe('amount of seconds'),
    }),
  },
);
