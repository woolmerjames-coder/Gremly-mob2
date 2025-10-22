// lib/cortex/pipelines/conversation.ts
import { CortexContextBase } from '../lane';
import { cortexDecide, type DecideInput, type CortexContext } from '../cortexDecide';

/**
 * Space Chat conversation pipeline.
 * Step 3: delegate to existing cortexDecide to keep behavior identical.
 * Step 4 will diverge behavior (no auto-sort, suppressed catch-all copy, etc.).
 */
export async function runConversationPipeline(input: DecideInput, ctx: CortexContext) {
  return cortexDecide(input, ctx);
}
