/**
 * Hub Components
 * Extracted sections from HubScreen for maintainability
 *
 * Hub V2 (Feb 2026): Added TimelineView and PeopleView
 */

export { default as HubHeader } from './HubHeader';
export type {
  HubHeaderProps,
  HubV1TypeFilter,
  HubV1TimeRange,
  HubV1StatusFilter,
  HubV1View,
} from './HubHeader';

export { default as ForgetSection } from './ForgetSection';
export type { ForgetSectionProps } from './ForgetSection';
// NeedsAttentionItem is re-exported from the source
export type { NeedsAttentionItem } from '../../lib/selectors/hubSelectors';

export { default as PopularTagsSection } from './PopularTagsSection';
export type { PopularTagsSectionProps } from './PopularTagsSection';

export { default as ArchivedLinkRow } from './ArchivedLinkRow';
export type { ArchivedLinkRowProps } from './ArchivedLinkRow';

export { default as AllItemsTable } from './AllItemsTable';

// Hub V2 components
export { default as TimelineView } from './TimelineView';
export type { TimelineViewProps } from './TimelineView';

export { default as PeopleView } from './PeopleView';
export type { PeopleViewProps } from './PeopleView';
