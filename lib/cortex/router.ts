// lib/cortex/router.ts
import { Lane, CortexContextBase } from './lane';
import { cortexDecide, type DecideInput, type CortexContext } from './cortexDecide';

export type Pipeline = 'classification' | 'conversation' | 'system';

export function laneToPipeline(lane: Lane): Pipeline {
  switch (lane) {
    case 'catchall':
      return 'classification';
    case 'space_chat':
      return 'conversation';
    case 'system':
    default:
      return 'system';
  }
}

/**
 * Stable router entry point.
 * For Step 2: delegate to existing cortexDecide so there is NO behavior change.
 * Later steps will branch logic per pipeline.
 */
export async function cortexRoute(input: DecideInput, ctx: CortexContext) {
  const pipeline = laneToPipeline(ctx.lane ?? 'system');

  // Dev telemetry (optional)
  if (process.env.EXPO_PUBLIC_DEBUG_CORTEX === 'on') {
    console.log(
      '[CORTEX][router] lane=%s pipeline=%s space=%s msg=%s',
      ctx.lane ?? 'system',
      pipeline,
      ctx.spaceId ?? '-',
      ctx.messageId ?? '-',
    );
  }

  // Step 2: No behavior change — still use existing cortexDecide.
  // Later we will split: classification vs conversation handlers.
  return cortexDecide(input, ctx);
}
