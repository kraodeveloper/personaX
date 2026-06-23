import { z } from 'zod';

/**
 * 模型信息(实时从 Anthropic Models API 拉取后归一化)。
 * contextWindow = max_input_tokens(用于 context 占比);maxOutput = max_tokens。
 */
export const ModelInfoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  contextWindow: z.number(),
  maxOutput: z.number(),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
