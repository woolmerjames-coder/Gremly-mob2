/**
 * Today's thread (Daily brief in Chat). A message typed straight under the
 * brief's question is the reply to it, and the app says which question it
 * was. The reply is told, so it takes the answer in rather than starting a
 * conversation of its own: the app adds the brief's next step after it.
 */

/** The prompt section for a reply to the brief's question, or '' when there is none. */
export function briefQuestionSection(question) {
  const q = typeof question === 'string' ? question.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  if (!q) return '';
  return `\n\n=== THE BRIEF'S QUESTION ===\nThis chat is their daily brief, and Gremly's last message asked them: "${q}"\nTheir message is their reply to it. When it answers the question, take the answer in and acknowledge it in a sentence or two, about that answer only. Gremly updates what it knows from their answer by itself, so never offer or promise to change, remove or mark anything. When it does not answer it, reply to what they said. Either way keep it short, and do not ask a question of your own or bring up other plans or items: the brief carries on with its next step straight after your reply.`;
}
