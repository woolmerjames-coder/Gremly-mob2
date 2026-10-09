import { talkAboutOpener, TALK_ABOUT_OPENER_COUNT } from '../talkAboutOpeners';

describe('talkAboutOpener', () => {
  it('names the item in every opener', () => {
    for (let i = 0; i < TALK_ABOUT_OPENER_COUNT; i++) {
      const line = talkAboutOpener('Take Pepper for a Walk', (i + 0.5) / TALK_ABOUT_OPENER_COUNT);
      expect(line).toContain('**Take Pepper for a Walk**');
    }
  });

  it('has a few different lines', () => {
    const lines = new Set(
      Array.from({ length: TALK_ABOUT_OPENER_COUNT }, (_, i) =>
        talkAboutOpener('X', (i + 0.5) / TALK_ABOUT_OPENER_COUNT),
      ),
    );
    expect(lines.size).toBe(TALK_ABOUT_OPENER_COUNT);
  });

  it('stays in range at the edges', () => {
    expect(talkAboutOpener('X', 0)).toBeTruthy();
    expect(talkAboutOpener('X', 1)).toBeTruthy();
  });

  it('never uses dashes as punctuation', () => {
    for (let i = 0; i < TALK_ABOUT_OPENER_COUNT; i++) {
      expect(talkAboutOpener('X', (i + 0.5) / TALK_ABOUT_OPENER_COUNT)).not.toMatch(/[–—]| - /);
    }
  });
});
