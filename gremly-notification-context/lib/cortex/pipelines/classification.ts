// lib/cortex/pipelines/classification.ts
import { CortexContextBase } from '../lane';
import { cortexDecide, type DecideInput, type CortexContext } from '../cortexDecide';

/**
 * Catch-All classification/sorting pipeline.
 * Step 3: delegate to existing cortexDecide to keep behavior identical.
 */
export async function runClassificationPipeline(input: DecideInput, ctx: CortexContext) {
  return cortexDecide(input, ctx);
}
