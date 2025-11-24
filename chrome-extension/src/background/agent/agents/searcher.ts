import { BaseAgent } from './base';
import {
  ChatModelAuthError,
  ChatModelBadRequestError,
  ChatModelForbiddenError,
  isAbortedError,
  isAuthenticationError,
  isBadRequestError,
  isForbiddenError,
  LLM_FORBIDDEN_ERROR_MESSAGE,
  RequestCancelledError,
} from './errors';
import { Actors, ExecutionState } from '../event/types';
import { HumanMessage } from '@langchain/core/messages';
import { createLogger } from '@src/background/log';
import { createAgent } from 'langchain';
import { z } from 'zod';
import type { BaseAgentOptions, ExtraAgentOptions } from './base';
import type { AgentOutput } from '../types';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ReactAgent } from 'langchain';

const logger = createLogger('SearcherAgent');
// Define Zod schema for searchear output
export const searcherOutputSchema = z.object({
  query: z.string(),
  answer: z.string().nullable(),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.url(),
      content: z.string(),
      publisher: z.string(),
      score: z.number(),
    }),
  ),
});

let searcher: ReactAgent<z.infer<typeof searcherOutputSchema>> | null = null;
export function createSearcherAgent(model: BaseChatModel) {
  if (searcher) {
    return searcher;
  }

  searcher = createAgent({
    model: model,
    responseFormat: searcherOutputSchema,
  });

  return searcher;
}

export type SearcherOutput = z.infer<typeof searcherOutputSchema>;

export class SearcherAgent extends BaseAgent<typeof searcherOutputSchema, SearcherOutput> {
  constructor(options: BaseAgentOptions, extraOptions?: Partial<ExtraAgentOptions>) {
    super(searcherOutputSchema, options, { ...extraOptions, id: 'searcher' });
  }

  async execute(userInstruction: string): Promise<AgentOutput<SearcherOutput>> {
    try {
      this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_START, 'Planning...');
      // get all messages from the message manager, state message should be the last one
      const messages = this.context.messageManager.getMessages();
      // Use full message history except the first one
      const searcherMessages = [this.prompt.getSystemMessage(), ...messages.slice(1)];

      searcherMessages[searcherMessages.length - 1] = new HumanMessage(userInstruction);

      const modelOutput = await this.invoke(searcherMessages);
      if (!modelOutput) {
        throw new Error('Failed to validate searcher output');
      }
      // clean the model output
      // const observation = filterExternalContent(modelOutput.observation);
      // const result = modelOutput.result;

      const cleanedPlan: SearcherOutput = {
        ...modelOutput,
        // observation,
        // result,
      };

      // If task is done, emit the final answer; otherwise emit next steps
      // const eventMessage = cleanedPlan.done;
      this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_OK, JSON.stringify(modelOutput));
      logger.info('Searcher output', JSON.stringify(cleanedPlan, null, 2));

      return {
        id: this.id,
        result: cleanedPlan,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Check if this is an authentication error
      if (isAuthenticationError(error)) {
        throw new ChatModelAuthError(errorMessage, error);
      } else if (isBadRequestError(error)) {
        throw new ChatModelBadRequestError(errorMessage, error);
      } else if (isAbortedError(error)) {
        throw new RequestCancelledError(errorMessage);
      } else if (isForbiddenError(error)) {
        throw new ChatModelForbiddenError(LLM_FORBIDDEN_ERROR_MESSAGE, error);
      }

      logger.error(`Planning failed: ${errorMessage}`);
      this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_FAIL, `Planning failed: ${errorMessage}`);
      return {
        id: this.id,
        error: errorMessage,
      };
    }
  }
}
