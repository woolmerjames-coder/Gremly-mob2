// lib/cortex/router.ts
import { Lane, CortexContextBase } from './lane';
import { cortexDecide, type DecideInput, type CortexContext } from './cortexDecide';
import { runClassificationPipeline, runConversationPipeline } from './pipelines';

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
 * Step 3: dispatch to specific pipeline modules.
 * Behavior remains identical (all pipelines delegate to cortexDecide).
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

  switch (pipeline) {
    case 'classification':
      return runClassificationPipeline(input, ctx);
    case 'conversation':
      return runConversationPipeline(input, ctx);
    case 'system':
    default:
      // keep parity; use cortexDecide for now
      return cortexDecide(input, ctx);
  }
}
