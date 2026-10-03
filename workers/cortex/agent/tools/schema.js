// ============================================================================
// schema.js: the agent's tool parameters, written once in a plain JSON schema
// that both providers read (Gemini function declarations and OpenAI tools
// take the same object, type and property shape). Kept to what both accept:
// no unions, no references, every object with its properties named. The
// agent runner (step 5) hands these over as they are.
// ============================================================================

export const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
export const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
export const bool = (description) => ({ type: 'boolean', description });
export const strEnum = (values, description) => ({ type: 'string', enum: values, description });
export const arr = (items, description) => ({ type: 'array', items, description });
export const obj = (properties, required = [], description) => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  ...(description ? { description } : {}),
});

const DAY = 'a date as YYYY-MM-DD';
export const day = (description) => str(`${description}, ${DAY}`);
export const time = (description) => str(`${description}, HH:MM on a 24 hour clock`);
