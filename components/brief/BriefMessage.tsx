/**
 * One message of the day's thread, drawn by its metadata type
 * (lib/brief/types.ts). Gremly's lines are ordinary chat bubbles; the day card
 * and plan card are drawn by the screen that owns their data, through the
 * render props, so this file never reads the store.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChatBubble } from '../chat/ChatBubble';
import { BriefOfferChips } from './BriefOfferChips';
import { BriefEventLine } from './BriefEventLine';
import { briefMetaOf, followsGremly } from '../../lib/brief/messages';
import type {
  BriefChangesMeta,
  BriefDayCardMeta,
  BriefPlanMeta,
  OfferButton,
} from '../../lib/brief/types';
import type { SpaceChatMessage } from '../../lib/types';

export type BriefMessageProps = {
  message: SpaceChatMessage;
  /** The message above, so a run of Gremly lines shows his name once */
  prev?: SpaceChatMessage;
  /** The offer whose buttons are live (lib/brief/messages liveOfferId) */
  liveOfferId?: string | null;
  /** False while the brief is still playing in: buttons wait */
  interactive?: boolean;
  onOfferButton?: (message: SpaceChatMessage, button: OfferButton) => void;
  renderDayCard?: (message: SpaceChatMessage, meta: BriefDayCardMeta) => React.ReactNode;
  renderPlan?: (message: SpaceChatMessage, meta: BriefPlanMeta) => React.ReactNode;
  renderChanges?: (message: SpaceChatMessage, meta: BriefChangesMeta) => React.ReactNode;
};

function BriefMessageInner({
  message,
  prev,
  liveOfferId,
  interactive = true,
  onOfferButton,
  renderDayCard,
  renderPlan,
  renderChanges,
}: BriefMessageProps) {
  const meta = briefMetaOf(message);
  if (!meta || meta.superseded) return null;

  switch (meta.type) {
    case 'brief-text':
      return (
        <View style={styles.message}>
          <ChatBubble
            message={message}
            hideMark={followsGremly(prev)}
            testID={`brief-text-${message.id}`}
          />
        </View>
      );
    case 'brief-reply':
      return (
        <View style={styles.message}>
          <ChatBubble message={message} testID={`brief-reply-${message.id}`} />
        </View>
      );
    case 'brief-offer': {
      const live = liveOfferId === message.id && !meta.chosen;
      return (
        <View style={styles.message} testID={`brief-offer-${message.id}`}>
          {message.content ? <ChatBubble message={message} hideMark={followsGremly(prev)} /> : null}
          {live ? (
            <BriefOfferChips
              buttons={meta.buttons}
              disabled={!interactive}
              onPress={(b) => onOfferButton?.(message, b)}
            />
          ) : null}
        </View>
      );
    }
    case 'brief-event':
      return <BriefEventLine text={message.content} icon={meta.icon} />;
    case 'brief-day-card':
      return <View style={styles.card}>{renderDayCard?.(message, meta) ?? null}</View>;
    case 'brief-plan':
      return <View style={styles.card}>{renderPlan?.(message, meta) ?? null}</View>;
    case 'brief-changes':
      return <View style={styles.card}>{renderChanges?.(message, meta) ?? null}</View>;
    default:
      return null;
  }
}

export const BriefMessage = React.memo(BriefMessageInner);

const styles = StyleSheet.create({
  message: {
    marginVertical: 2,
  },
  card: {
    paddingHorizontal: 16,
    marginVertical: 8,
  },
});
