/**
 * Forget Everything (cortex context/forget.js) leaves an events row of this
 * kind with the time it ran. Reading starts again from then, so what came
 * before is never read back in and carries no private mark; the words seen
 * at a glance leave it out (inngest-jobs context/filed.js).
 */
export const FORGOTTEN_KIND = 'context.forgotten';
