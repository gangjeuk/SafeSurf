import { createAgent } from 'langchain';
import { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ReactAgent } from 'langchain';

export const summarizerStateSchema = z.object({
  query: z.string(),
  answer: z.string().optional(),
});

export const summarizerOutputSchema = z.object({
  results: z.array(z.object({ content: z.string(), highlight: z.string() })),
});

let summarizer: ReactAgent<z.infer<typeof summarizerOutputSchema>, typeof summarizerStateSchema> | null = null;

export function createSummarizer(model: BaseChatModel) {
  if (summarizer) {
    return summarizer;
  }

  summarizer = createAgent({
    model: model,
    responseFormat: summarizerOutputSchema,
    stateSchema: summarizerStateSchema,
  });
  return summarizer;
}
