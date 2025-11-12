/* eslint-disable @typescript-eslint/no-unused-vars */
import { BasePrompt } from './base';
import { searcherSystemPromptTemplate } from './templates/searcher';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { createLogger } from '@src/background/log';
import type { AgentContext } from '@src/background/agent/types';

const logger = createLogger('agent/prompts/navigator');

export class SearcherPrompt extends BasePrompt {
  getSystemMessage(): SystemMessage {
    return new SystemMessage(searcherSystemPromptTemplate);
  }

  async getUserMessage(context: AgentContext): Promise<HumanMessage> {
    return new HumanMessage('');
  }
}
