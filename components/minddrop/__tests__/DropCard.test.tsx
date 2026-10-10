/**
 * DropCard: look A (Mind Drop rethink stage 5). Each state for each kind: the
 * title, the kind word, the meta parts in order, no second line, and the final
 * state reached with reduced motion on (the default in tests) and off.
 */
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_t, name) => (props: any) =>
        React.createElement(View, {
          testID: `icon-${String(name)}`,
          accessibilityLabel: props?.strokeDasharray ? 'drawing' : undefined,
        }),
    },
  );
});

const mockReduced = { value: true };
jest.mock('../../../design/animations', () => ({
  useReducedMotion: () => mockReduced.value,
}));

import { DropCard } from '../DropCard';
import { KIND_WORDS, type DropCardKind, type MetaPart } from '../../../lib/minddrop/dropCardModel';

const KINDS: DropCardKind[] = ['todo', 'habit', 'event', 'journal', 'idea', 'note', 'ask'];
const META: MetaPart[] = [
  { key: 'when', icon: 'calendar', text: 'Due Fri' },
  { key: 'long', icon: 'clock', text: 'About 10 min' },
];

beforeEach(() => {
  mockReduced.value = true;
});

describe('DropCard, landed', () => {
  it.each(KINDS)(
    '%s: shows the words as typed, the breathing dot and the waiting dots, nothing else',
    (kind) => {
      const r = render(
        <DropCard
          kind={kind}
          stage="landed"
          rawTitle="email the hoa about the parking permit before friday"
          title="Email the HOA about the parking permit"
          meta={META}
        />,
      );
      expect(r.getByTestId('drop-card-title').props.children).toBe(
        'email the hoa about the parking permit before friday',
      );
      expect(r.getByTestId('drop-card-catch')).toBeTruthy();
      expect(r.getByTestId('drop-card-wait')).toBeTruthy();
      expect(r.queryByTestId('drop-card-kind-word')).toBeNull();
      expect(r.queryByText('Due Fri')).toBeNull();
      expect(r.queryByText(/Organizing/)).toBeNull();
    },
  );
});

describe('DropCard, stopped (a drop that did not go through)', () => {
  it('keeps the words as typed and its footer, with no waiting dots, and reads as the words', () => {
    const r = render(
      <DropCard
        kind="note"
        stage="landed"
        rawTitle="email the hoa about the parking permit"
        title="email the hoa about the parking permit"
        meta={[]}
        stopped
        footer={<Text>That didn't go through. Tap to try again.</Text>}
        testID="card"
      />,
    );
    expect(r.getByTestId('drop-card-title').props.children).toBe(
      'email the hoa about the parking permit',
    );
    expect(r.queryByTestId('drop-card-wait')).toBeNull();
    expect(r.getByText("That didn't go through. Tap to try again.")).toBeTruthy();
    expect(r.getByTestId('card').props.accessibilityLabel).toBe(
      'email the hoa about the parking permit',
    );
  });
});

describe('DropCard, sorted', () => {
  it.each(KINDS)(
    '%s: the kind tile, the title and the kind word; the rest waits for the settle',
    (kind) => {
      const r = render(
        <DropCard kind={kind} stage="sorted" rawTitle="raw words" title="The title" meta={META} />,
      );
      expect(r.getByTestId('drop-card-title').props.children).toBe('The title');
      expect(r.getByTestId(`drop-card-icon-${kind}`)).toBeTruthy();
      expect(r.getByTestId('drop-card-kind-word').props.children).toBe(KIND_WORDS[kind]);
      expect(r.queryByTestId('drop-card-wait')).toBeNull();
      expect(r.queryByTestId('drop-card-meta-when')).toBeNull();
    },
  );
});

describe('DropCard, settled', () => {
  it.each(KINDS.filter((k) => k !== 'ask'))(
    '%s: the meta line in order after the kind word, and no second line',
    (kind) => {
      const r = render(
        <DropCard kind={kind} stage="settled" rawTitle="raw" title="The title" meta={META} />,
      );
      const meta = r.getByTestId('drop-card-meta');
      const texts = meta
        .findAllByType(Text)
        .map((t: { props: { children: unknown } }) => t.props.children);
      expect(texts).toEqual([KIND_WORDS[kind], 'Due Fri', 'About 10 min']);
      // the title and the meta line are the only words on the card
      const all = r.UNSAFE_getAllByType(Text).map((t) => t.props.children);
      expect(all).toEqual(['The title', KIND_WORDS[kind], 'Due Fri', 'About 10 min']);
    },
  );

  it('a question card shows One quick question and nothing more', () => {
    const r = render(
      <DropCard kind="ask" stage="settled" rawTitle="dentist" title="Dentist" meta={[]} />,
    );
    expect(r.getByTestId('drop-card-kind-word').props.children).toBe('One quick question');
    expect(r.getByTestId('icon-MessageCircleQuestionMark')).toBeTruthy();
  });

  it('offers the talk row on the newest card once settled, at least 32 high', () => {
    const onTalk = jest.fn();
    const r = render(
      <DropCard
        kind="todo"
        stage="settled"
        rawTitle="x"
        title="X"
        meta={[]}
        onTalk={onTalk}
        talkTestID="talk"
      />,
    );
    const talk = r.getByTestId('talk');
    expect(r.getByText('Talk it through with Gremly')).toBeTruthy();
    fireEvent.press(talk);
    expect(onTalk).toHaveBeenCalled();
    const sorted = render(
      <DropCard
        kind="todo"
        stage="sorted"
        rawTitle="x"
        title="X"
        meta={[]}
        onTalk={onTalk}
        talkTestID="talk2"
      />,
    );
    expect(sorted.queryByTestId('talk2')).toBeNull();
  });

  it('reads as one label: kind, title and meta line', () => {
    const r = render(
      <DropCard
        kind="todo"
        stage="settled"
        rawTitle="x"
        title="Call mum"
        meta={META}
        testID="card"
      />,
    );
    expect(r.getByTestId('card').props.accessibilityLabel).toBe(
      'Todo. Call mum. Due Fri. About 10 min',
    );
  });
});

describe('DropCard, moving between states', () => {
  it('reaches each final state with reduced motion on', () => {
    const r = render(
      <DropCard
        kind="todo"
        stage="landed"
        rawTitle="call mum"
        title="Call mum about Sunday"
        meta={META}
      />,
    );
    r.rerender(
      <DropCard
        kind="todo"
        stage="sorted"
        rawTitle="call mum"
        title="Call mum about Sunday"
        meta={META}
      />,
    );
    expect(r.getByTestId('drop-card-title').props.children).toBe('Call mum about Sunday');
    r.rerender(
      <DropCard
        kind="todo"
        stage="settled"
        rawTitle="call mum"
        title="Call mum about Sunday"
        meta={META}
      />,
    );
    expect(r.getByTestId('drop-card-meta-long')).toBeTruthy();
  });

  it('with motion on, cross fades the words to the title and draws the icon', () => {
    mockReduced.value = false;
    const r = render(
      <DropCard
        kind="todo"
        stage="landed"
        rawTitle="call mum"
        title="Call mum about Sunday"
        meta={META}
      />,
    );
    r.rerender(
      <DropCard
        kind="todo"
        stage="sorted"
        rawTitle="call mum"
        title="Call mum about Sunday"
        meta={META}
      />,
    );
    // the title, with the words fading out over it
    expect(r.getByTestId('drop-card-title').props.children).toBe('Call mum about Sunday');
    // hidden from screen readers: the card reads its title once
    expect(r.getByText('call mum', { includeHiddenElements: true })).toBeTruthy();
    r.rerender(
      <DropCard
        kind="todo"
        stage="settled"
        rawTitle="call mum"
        title="Call mum about Sunday"
        meta={META}
      />,
    );
    expect(r.getByTestId('drop-card-meta-when')).toBeTruthy();
  });

  it('does not cross fade when only the first capital differs', () => {
    mockReduced.value = false;
    const r = render(
      <DropCard kind="todo" stage="landed" rawTitle="buy milk" title="Buy milk" meta={[]} />,
    );
    r.rerender(
      <DropCard kind="todo" stage="sorted" rawTitle="buy milk" title="Buy milk" meta={[]} />,
    );
    expect(r.queryByText('buy milk', { includeHiddenElements: true })).toBeNull();
    expect(r.getByText('Buy milk')).toBeTruthy();
  });
});

describe('DropCard, a title that changes (final check item 11)', () => {
  it('crossfades a title that changes on a card already sorted, holding the taller height', () => {
    mockReduced.value = false;
    const r = render(
      <DropCard kind="todo" stage="sorted" rawTitle="x" title="Book flights" meta={META} />,
    );
    fireEvent(r.getByTestId('drop-card-title-box'), 'layout', {
      nativeEvent: { layout: { height: 42 } },
    });
    r.rerender(
      <DropCard
        kind="todo"
        stage="sorted"
        rawTitle="x"
        title="Book flights to Lisbon"
        meta={META}
      />,
    );
    expect(r.getByTestId('drop-card-title').props.children).toBe('Book flights to Lisbon');
    // the old title fades out over it, hidden from screen readers
    expect(r.getByText('Book flights', { includeHiddenElements: true })).toBeTruthy();
    expect(r.getByTestId('drop-card-title-box').props.style).toEqual({ minHeight: 42 });
  });

  it('changes at once with reduced motion on', () => {
    const r = render(
      <DropCard kind="todo" stage="settled" rawTitle="x" title="Book flights" meta={META} />,
    );
    r.rerender(
      <DropCard
        kind="todo"
        stage="settled"
        rawTitle="x"
        title="Book flights to Lisbon"
        meta={META}
      />,
    );
    expect(r.getByTestId('drop-card-title').props.children).toBe('Book flights to Lisbon');
    expect(r.queryByText('Book flights', { includeHiddenElements: true })).toBeNull();
    expect(r.getByTestId('drop-card-title-box').props.style).toBeUndefined();
  });
});

describe('DropCard, where it lives (stage 9)', () => {
  const card = (stage: 'sorted' | 'settled', onPress = jest.fn()) => (
    <DropCard
      kind="todo"
      stage={stage}
      rawTitle="book flights"
      title="Book flights for Lisbon"
      meta={META}
      place={{ text: 'Lisbon trip', onPress }}
      testID="card"
    />
  );

  it('is the meta line’s last part once the card has settled, and a tap opens the picker', () => {
    const onPress = jest.fn();
    const r = render(card('settled', onPress));
    expect(r.getByText('Lisbon trip')).toBeTruthy();
    fireEvent.press(r.getByTestId('drop-card-meta-place'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('waits for the settle, as the rest of the line does', () => {
    const r = render(card('sorted'));
    expect(r.queryByText('Lisbon trip')).toBeNull();
  });

  it('is read with the card, and offers changing it to VoiceOver', () => {
    const onPress = jest.fn();
    const r = render(card('settled', onPress));
    const el = r.getByTestId('card');
    expect(el.props.accessibilityLabel).toBe(
      'Todo. Book flights for Lisbon. Due Fri. About 10 min. Lisbon trip',
    );
    expect(el.props.accessibilityActions).toEqual([
      { name: 'place', label: 'Change where it lives' },
    ]);
    fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'place' } });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a card filed nowhere shows no place and asks nothing', () => {
    const r = render(
      <DropCard
        kind="todo"
        stage="settled"
        rawTitle="x"
        title="Call mum"
        meta={META}
        testID="card"
      />,
    );
    expect(r.queryByTestId('drop-card-meta-place')).toBeNull();
    expect(r.getByTestId('card').props.accessibilityActions).toBeUndefined();
  });
});
