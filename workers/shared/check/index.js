/**
 * The check (data fabric stage 3), built once for every writer in both
 * workers. The morning is the first place it runs: the daily picture
 * (inngest-jobs/context/daily.js) and the brief (inngest-jobs/brief/writer.js).
 *
 * stated.js  the code steps: refs, stated values, digits, glanceable lines
 * words.js   the one question a small model is asked about each sentence
 * run.js     the outcome: pass, send back once, leave out; and its log row
 */

export {
  STATED_KINDS,
  SENTENCE_SCHEMA,
  STATED_RULES,
  codeCheck,
  compareValue,
  digitsIn,
  numbersOf,
  normalDate,
  normalNumber,
  normalTime,
} from './stated.js';
export { WORDS_SCHEMA, WORDS_PROMPT_VERSION, wordsRequest, wordsProblem } from './words.js';
export { runCheck, checkRunRow, problemList, problemWords } from './run.js';
