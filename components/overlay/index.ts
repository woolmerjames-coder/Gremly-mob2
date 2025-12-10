/**
 * Unified Create Overlay - Phase 7
 * Centralized export for the new unified overlay and its field components
 */

// Expose a single gateway export surface. Callers should import the
// OverlayComponent from the overlay package root to avoid depending on
// implementation-specific modules.
export { OverlayComponent } from './gateway';
export type { UnifiedCreateOverlayProps } from './UnifiedCreateOverlay';

// Export Mind Drop helpers
export { getMindDropRawText, hasMindDropRawText } from './getMindDropRawText';

// Make Actionable feature components
export { MakeActionableButton } from './MakeActionableButton';
export { ChecklistView } from './ChecklistView';
export { ChecklistProgress } from './ChecklistProgress';
export { RevertToTextButton } from './RevertToTextButton';
export { TodoPreviewModal } from './TodoPreviewModal';

// Intentionally do NOT export UnifiedCreateOverlay or UnifiedOverlayV2
// directly — those are implementation details and should be reached via
// the gateway when needed for storybooks or dev previews.
