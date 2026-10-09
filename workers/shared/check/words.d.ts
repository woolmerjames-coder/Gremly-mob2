/** Types for words.js, the check's one question in words (data fabric stage 3). */
export const WORDS_PROMPT_VERSION: string;
export const WORDS_SCHEMA: Record<string, unknown>;
export function wordsRequest(p: {
  sentence: { text: string };
  records?: Array<{ label?: string }>;
  today: string;
  moment?: string | null;
  person?: { first_name?: string | null } | null;
}): { system: string; user: string; schema: Record<string, unknown> };
export function wordsProblem(output: unknown): { step: 'words'; say: string } | null;
