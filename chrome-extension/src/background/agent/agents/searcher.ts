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
import { z } from 'zod';
import type { BaseAgentOptions, ExtraAgentOptions } from './base';
import type { AgentOutput } from '../types';

const logger = createLogger('SearcherAgent');

enum InfoImportance {
  NOT_IMPORTANT = 0,
  IMPORTANT = 1,
  VERY_IMPORTANT = 2, // you can mix numerical and string enums
  CRITICAL = 3,
}

// const urlData = z.object({
//   title: z.string(),
//   url: z.string().url(),
//   // HTML meta tag. <meta name=description />
//   description: z.string(),
//   importance: z.nativeEnum(InfoImportance).transform(val => {
//     if (val.toString() === '0') return 0;
//     if (val.toString() === '1') return 1;
//     if (val.toString() === '2') return 2;
//     throw new Error('Invalid information importance');
//   }),
// });

// const youtubeData = z.object({
//   title: z.string(),
//   url: z.string().url(),
//   channel: z.string(),
//   importance: z.nativeEnum(InfoImportance).transform(val => {
//     if (val.toString() === '0') return 0;
//     if (val.toString() === '1') return 1;
//     if (val.toString() === '2') return 2;
//     throw new Error('Invalid information importance');
//   }),
// });

const dataImportance = z.object({
  importance: z.nativeEnum(InfoImportance).transform(val => {
    console.log(val);
    if (val.toString() === '0') return 0;
    if (val.toString() === '1') return 1;
    if (val.toString() === '2') return 2;
    if (val.toString() === '3') return 3;
    throw new Error('Invalid information importance');
  }),
});

const pageSummarizeData = z.object({
  summarize: z.string(),
  keySentence: z.array(z.string()),
});

// Define Zod schema for planner output
export const searcherOutputSchema = z.union([z.array(dataImportance), pageSummarizeData]);

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
