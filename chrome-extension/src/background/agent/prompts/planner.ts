/* eslint-disable @typescript-eslint/no-unused-vars */
import { BasePrompt } from './base';
import { plannerSystemPromptTemplate } from './templates/planner';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AgentContext } from '@src/background/agent/types';

export class PlannerPrompt extends BasePrompt {
  getSystemMessage(): SystemMessage {
    return new SystemMessage(plannerSystemPromptTemplate);
  }

  async getUserMessage(context: AgentContext): Promise<HumanMessage> {
    return new HumanMessage('');
  }
}
