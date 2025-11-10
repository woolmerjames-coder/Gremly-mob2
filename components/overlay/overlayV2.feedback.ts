/**
 * overlayV2.feedback.ts — lightweight feedback helper for overlay AI suggestions
 */
export type OverlayFeedbackEvent = {
  type: 'title' | 'tags';
  accepted: boolean;
  prev: string;
  newValue: string;
};

export async function recordOverlayFeedback(event: OverlayFeedbackEvent) {
  try {
    // dynamic import to avoid hard dependency in environments where cortex isn't available
    const cortex = await import('../../lib/cortex/CortexClient');
    if (cortex && typeof (cortex as any).feedbackOverlay === 'function') {
      try {
        await (cortex as any).feedbackOverlay(event);
        return;
      } catch (e) {
        // swallow and fallback to logging
      }
    }
    // Fallback: log the event for local diagnostics
    console.log('[OverlayFeedback]', event);
  } catch (e) {
    // Swallow any errors — feedback must not block user flows
  }
}

export default recordOverlayFeedback;
