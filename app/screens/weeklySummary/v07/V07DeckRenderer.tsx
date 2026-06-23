/**
 * V07DeckRenderer — FlatList wrapper for v0.7 (content_version: 4) decks.
 *
 * Dispatches on card.shape. Each shape component is implemented in its own file
 * and imported below. This component is structurally identical to the legacy v05
 * FlatList path in WeeklySummaryV2Screen; it just feeds deck.cards and uses shape
 * rather than type as the discriminant.
 *
 * Prompt 11 wires all 8 card components. Until then the switch falls through to null
 * for shapes not yet implemented.
 */

import React from 'react';
import {
  View,
  ScrollView,
  FlatList,
  type StyleProp,
  type ViewStyle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { V07Deck, V07Card } from '../../../../lib/types';
import { HeroCard } from './cards/HeroCard';
import { MomentCard } from './cards/MomentCard';
import { PeopleCard } from './cards/PeopleCard';
import { PatternCard } from './cards/PatternCard';
import { QuestionCard } from './cards/QuestionCard';
import { StatCard } from './cards/StatCard';
import { TimelineCard } from './cards/TimelineCard';
import { LetterCard } from './cards/LetterCard';

interface V07DeckRendererProps {
  deck: V07Deck | null | undefined;
  currentCardIndex: number;
  onScrollEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  flatListRef: React.RefObject<FlatList | null>;
  screenWidth: number;
  cardScrollStyle: StyleProp<ViewStyle>;
  cardScrollContentStyle: StyleProp<ViewStyle>;
}

function renderV07Card(card: V07Card): React.ReactNode {
  switch (card.shape) {
    case 'hero':
      return <HeroCard card={card} />;
    case 'moment':
      return <MomentCard card={card} />;
    case 'people':
      return <PeopleCard card={card} />;
    case 'pattern':
      return <PatternCard card={card} />;
    case 'question':
      return <QuestionCard card={card} />;
    case 'stat':
      return <StatCard card={card} />;
    case 'timeline':
      return <TimelineCard card={card} />;
    case 'letter':
      return <LetterCard card={card} />;
    default:
      console.warn('[V07DeckRenderer] Unknown card shape:', (card as V07Card).shape);
      return null;
  }
}

export function V07DeckRenderer({
  deck,
  onScrollEnd,
  flatListRef,
  screenWidth,
  cardScrollStyle,
  cardScrollContentStyle,
}: V07DeckRendererProps) {
  const cards = deck?.cards ?? [];

  return (
    <FlatList
      ref={flatListRef}
      data={cards}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      decelerationRate={0.95}
      onMomentumScrollEnd={onScrollEnd}
      keyExtractor={(_, i) => String(i)}
      renderItem={({ item }) => (
        <View style={{ width: screenWidth }}>
          <ScrollView
            style={cardScrollStyle}
            contentContainerStyle={cardScrollContentStyle}
            showsVerticalScrollIndicator={false}
          >
            {renderV07Card(item)}
          </ScrollView>
        </View>
      )}
    />
  );
}
