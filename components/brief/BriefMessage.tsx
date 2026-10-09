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
  BriefMeta,
  BriefOfferMeta,
  BriefPlanMeta,
  KeepOfferMeta,
  OfferAction,
  OfferButton,
} from '../../lib/brief/types';
import type { OfferView } from '../../lib/brief/checkIn';
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
  /** The evening wrap up's cards (lib/wrapup), drawn by the screen that owns the wrap up */
  renderWrap?: (message: SpaceChatMessage, meta: BriefMeta) => React.ReactNode;
  /** The weekly review's cards and the button to their week (lib/week), drawn by the screen that owns the review */
  renderWeek?: (message: SpaceChatMessage, meta: BriefMeta) => React.ReactNode;
  /** The Save button under a reply worth keeping (lib/worlds/keep.ts), drawn by the chat it is in */
  renderKeep?: (message: SpaceChatMessage, meta: KeepOfferMeta) => React.ReactNode;
  /**
   * A question about a Chapter, put as the Worlds card under Gremly's words
   * in place of the buttons (components/worlds/ChatAskCard). Undefined for a
   * question the card does not put, which keeps its buttons.
   */
  renderAsk?: (message: SpaceChatMessage, meta: BriefOfferMeta) => React.ReactNode | undefined;
  /** Buttons left out of a live offer for now (Write a few lines, while the box already saves to the journal) */
  hiddenActions?: OfferAction[];
  /**
   * How an offer is shown with their week as the app holds it now: as the
   * habit check in riding on it, or with Plan my week beside its buttons
   * (lib/brief/checkIn.ts shownOffer). The offer as written when left out.
   */
  showOffer?: (message: SpaceChatMessage, meta: BriefOfferMeta) => OfferView;
  /** A habit's week, under Gremly's reply to the check in */
  renderHabitWeek?: (week: { habit_id: string; day: string }) => React.ReactNode;
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
  renderWrap,
  renderWeek,
  renderKeep,
  renderAsk,
  hiddenActions,
  showOffer,
  renderHabitWeek,
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
          {meta.habit_week ? (renderHabitWeek?.(meta.habit_week) ?? null) : null}
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
      const view: OfferView = showOffer?.(message, meta) ?? {
        content: message.content,
        buttons: meta.buttons,
        hint: meta.hint,
        checkIn: false,
      };
      const shown =
        view.content === message.content ? message : { ...message, content: view.content };
      const ask = renderAsk?.(message, meta);
      if (ask !== undefined) {
        return (
          <View style={styles.message} testID={`brief-offer-${message.id}`}>
            {view.content ? <ChatBubble message={shown} hideMark={followsGremly(prev)} /> : null}
            {ask ? <View style={styles.card}>{ask}</View> : null}
          </View>
        );
      }
      return (
        <View style={styles.message} testID={`brief-offer-${message.id}`}>
          {view.content ? <ChatBubble message={shown} hideMark={followsGremly(prev)} /> : null}
          {live ? (
            <BriefOfferChips
              buttons={
                hiddenActions?.length
                  ? view.buttons.filter((b) => !hiddenActions.includes(b.action))
                  : view.buttons
              }
              disabled={!interactive}
              hint={view.hint}
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
    case 'sweep-recap':
    case 'sweep-receipt':
    case 'sweep-habits':
    case 'sweep-journal':
    case 'sweep-item':
    case 'sweep-end': {
      const drawn = renderWrap?.(message, meta);
      return drawn ? <View style={styles.card}>{drawn}</View> : null;
    }
    case 'week-card':
    case 'week-offer': {
      const drawn = renderWeek?.(message, meta);
      return drawn ? <View style={styles.card}>{drawn}</View> : null;
    }
    case 'keep-offer': {
      const drawn = renderKeep?.(message, meta);
      return drawn ? <View style={styles.card}>{drawn}</View> : null;
    }
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
