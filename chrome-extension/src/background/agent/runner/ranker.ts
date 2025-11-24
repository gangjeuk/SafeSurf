import { createAgent } from 'langchain';
import { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ReactAgent } from 'langchain';

export const rankerOutputSchema = z.array(
  z.object({
    index: z.number(),
    score: z.number(),
  }),
);

let ranker: ReactAgent<z.infer<typeof rankerOutputSchema>> | null = null;

export function createRanker(model: BaseChatModel) {
  if (ranker) {
    return ranker;
  }

  ranker = createAgent({
    model: model,
    responseFormat: rankerOutputSchema,
  });
  return ranker;
}
