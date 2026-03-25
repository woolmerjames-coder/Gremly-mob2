/**
 * Test utility: Simulate degraded Mind Drop classification.
 *
 * Temporarily patches runPhase1 to return a degraded fallback
 * for the next N calls, then restores normal behavior.
 *
 * Usage in test mode or dev console:
 *   simulateDegradedClassification(2) // Next 2 drops will be degraded
 */

let degradedCallsRemaining = 0;

export function simulateDegradedClassification(count: number = 1): void {
  if (!__DEV__) {
    console.warn('simulateDegradedClassification only works in dev mode');
    return;
  }

  degradedCallsRemaining = count;
  console.log(`[TestHardening] Next ${count} classification(s) will be degraded`);
}

export function isDegradedSimulationActive(): boolean {
  return degradedCallsRemaining > 0;
}

export function consumeDegradedSimulation(): boolean {
  if (degradedCallsRemaining > 0) {
    degradedCallsRemaining--;
    console.log(
      `[TestHardening] Simulating degraded classification (${degradedCallsRemaining} remaining)`,
    );
    return true;
  }
  return false;
}
