// ============================================================================
// status.js: the line the person sees while Gremly works through a step, one
// per tool, written here rather than by the model so it is instant and never
// claims more than the step does.
// ============================================================================

/**
 * The status line for one tool call, or null for steps the person needn't see.
 * @param {string} name the tool
 * @param {object} args what the model asked it
 * @param {{today?: string}} ctx
 */
export function statusFor(name, args = {}, ctx = {}) {
  switch (name) {
    case 'find_items':
      return 'Looking through your things';
    case 'get_item':
      return 'Reading it through';
    case 'get_day':
      return !args?.date || args.date === ctx.today ? 'Looking at your day' : 'Looking at that day';
    case 'get_week':
      return 'Looking at your week';
    case 'recall':
      return 'Thinking back';
    case 'web_search':
      return 'Searching the web';
    case 'propose_changes':
      return 'Getting the changes ready';
    default:
      return null;
  }
}
