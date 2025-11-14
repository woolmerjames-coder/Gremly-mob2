import { v2Reducer, initialV2State } from '../components/overlay/overlayV2.state';

describe('overlay title lock behaviour', () => {
  it('applies AI titles when not locked', () => {
    const next = v2Reducer(initialV2State, { type: 'SET_TITLE_AI', title: 'AI Suggestion' });
    expect(next.log.title).toBe('AI Suggestion');
    expect(next.titleLocked).toBe(false);
  });

  it('skips AI titles when locked', () => {
    const manual = v2Reducer(initialV2State, {
      type: 'SET_TITLE_USER',
      title: 'Manual Title',
    });
    const result = v2Reducer(manual, {
      type: 'SET_TITLE_AI',
      title: 'Overwriting AI',
    });
    expect(result.log.title).toBe('Manual Title');
    expect(result.titleLocked).toBe(true);
  });

  it('locks when user sets the title', () => {
    const next = v2Reducer(initialV2State, {
      type: 'SET_TITLE_USER',
      title: 'Manual Title',
    });
    expect(next.log.title).toBe('Manual Title');
    expect(next.titleLocked).toBe(true);
  });

  it('keeps locked titles when body text changes', () => {
    const manual = v2Reducer(initialV2State, {
      type: 'SET_TITLE_USER',
      title: 'Manual Title',
    });
    const updated = v2Reducer(manual, {
      type: 'SET_TEXT',
      text: 'First line becomes body\nSecond line',
    });
    expect(updated.log.body).toBe('First line becomes body\nSecond line');
    expect(updated.log.title).toBe('Manual Title');
    expect(updated.titleLocked).toBe(true);
  });
});

describe('overlay tag metadata', () => {
  it('adds tags to stickyTags when user adds them', () => {
    const added = v2Reducer(initialV2State, { type: 'ADD_TAG', tag: 'focus' });
    expect(added.tags).toContain('focus');
    expect(added.stickyTags).toContain('focus');
    expect(added.tagTombstones).not.toContain('focus');
  });

  it('records tombstones when tags are removed', () => {
    const withTag = v2Reducer(initialV2State, { type: 'ADD_TAG', tag: 'focus' });
    const removed = v2Reducer(withTag, { type: 'REMOVE_TAG', tag: 'focus' });
    expect(removed.tags).not.toContain('focus');
    expect(removed.stickyTags).not.toContain('focus');
    expect(removed.tagTombstones).toContain('focus');
  });

  it('drops sticky tags but keeps tombstones when tags are replaced', () => {
    const withHistory = v2Reducer(initialV2State, { type: 'ADD_TAG', tag: 'focus' });
    const afterRemove = v2Reducer(withHistory, { type: 'REMOVE_TAG', tag: 'focus' });
    const reset = v2Reducer(afterRemove, { type: 'SET_TAGS', tags: ['deep work'] });
    expect(reset.tags).toEqual(['deep work']);
    expect(reset.stickyTags).toEqual([]);
    expect(reset.tagTombstones).toContain('focus');
  });
});
