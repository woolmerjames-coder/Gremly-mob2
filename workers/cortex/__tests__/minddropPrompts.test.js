/**
 * Mind Drop's title and reaction prompts (minddropPrompts.js), held to the
 * house rules: semantic rules only, no examples, no dashes, no card note, and
 * a reaction that never asks the person anything (Mind Drop rethink stage 2).
 */
import {
  detailsPrompt,
  reclassifyPrompt,
  titleReactionPrompt,
  titleReactionUser,
} from '../minddropPrompts.js';
import { TIME_ESTIMATE_RULES } from '../enrichRules.js';
import * as PROMPTS from '../minddropPrompts.js';

const title = titleReactionPrompt({ currentDate: '2026-10-09', dayOfWeek: 'Friday' });
const reclassify = reclassifyPrompt();
const prompts = { title, reclassify };

describe.each(Object.entries(prompts))('the %s prompt', (_name, text) => {
  it('has no dashes as punctuation', () => {
    expect(text).not.toMatch(/[–—]/);
    expect(text).not.toMatch(/\S[ \t]+-[ \t]+\S/); // a dash between words; list bullets start a line
  });

  it('has no examples', () => {
    expect(text).not.toMatch(
      /\bexamples?\b|\be\.g\.|\bsuch as\b|\bfor instance\b|\bfor example\b|\blike this\b/i,
    );
    expect(text).not.toMatch(/"[^"\n]+"\s*,\s*"[^"\n]+"\s*,\s*"[^"\n]+"/); // no quoted phrase lists
  });

  it('asks for sentence case titles, never title case', () => {
    expect(text).toMatch(/Sentence case/);
    expect(text).not.toMatch(/Title case/i);
  });

  it('never invites a question in the reaction', () => {
    expect(text).not.toMatch(/a question that shows/i);
    expect(text).not.toMatch(/whether it is a question/i);
    expect(text).toMatch(/Never ask them anything or invite a reply/);
  });

  it('tells the reaction to use no dashes', () => {
    expect(text).toMatch(/No dashes/);
  });

  it('leaves how long it takes out of the title', () => {
    expect(text).toMatch(/how long it takes/);
  });
});

describe('the title and reaction prompt', () => {
  it('writes no card note', () => {
    expect(title).not.toMatch(/card.note/i);
    expect(Object.keys(PROMPTS).some((k) => /CARD_NOTE/i.test(k))).toBe(false);
  });

  it('works out the kind itself when none is given', () => {
    expect(title).not.toMatch(/has already been decided/);
    expect(title).toMatch(/When it is not given/);
  });

  it('sends the kind only when there is one', () => {
    const none = titleReactionUser({ text: 'dentist' });
    expect(none).not.toMatch(/BUCKET/);
    expect(none).not.toMatch(/SUBTYPE/);
    const given = titleReactionUser({ text: 'dentist', bucket: 'todo', subtype: null });
    expect(given).toMatch(/BUCKET: todo/);
  });

  it('keeps the recent reactions, so this one differs from them', () => {
    const msg = titleReactionUser({
      text: 'dentist',
      recentReactions: ['First one.', 'Second one.'],
    });
    expect(msg).toMatch(/YOUR RECENT REACTIONS, NEWEST LAST:\n- "First one."\n- "Second one."/);
  });
});

describe('the details prompt (stage 2b: every detail left out of a title has a home)', () => {
  const kinds = [
    { bucket: 'todo', subtype: null },
    { bucket: 'habit', subtype: 'start_habit' },
    { bucket: 'log', subtype: 'journal' },
    { bucket: 'log', subtype: 'event' },
    { bucket: 'log', subtype: 'general' },
  ];
  const details = kinds.map((k) =>
    detailsPrompt({
      currentDate: '2026-10-09',
      dayOfWeek: 'Friday',
      timezone: 'America/Los_Angeles',
      userSelectedDate: null,
      ...k,
    }),
  );

  it('has no examples and no dashes as punctuation', () => {
    for (const text of details) {
      expect(text).not.toMatch(/[–—]/);
      expect(text).not.toMatch(/\S[ \t]+-[ \t]+\S/);
      expect(text).not.toMatch(
        /\bexamples?\b|\be\.g\.|\bsuch as\b|\bfor instance\b|\bfor example\b/i,
      );
      expect(TIME_ESTIMATE_RULES).not.toMatch(/\bsuch as\b|\bfor example\b|\be\.g\./i);
    }
  });

  it('asks for a todo clock time, which the app saves as its due time', () => {
    expect(details[0]).toMatch(/"event_time": "HH:mm" \| null/);
    const todoShape = details[0].split('For a todo:')[1].split('For a habit being built')[0];
    expect(todoShape).toMatch(/"event_time"/);
  });

  it('places a part of the day they name, even without a clock time', () => {
    expect(details[0]).toMatch(/part of the day/);
    expect(details[3]).toMatch(/folded into a word for the day/);
  });

  it('asks for a mood on any note that says how they feel, not only a journal', () => {
    expect(details[4]).toMatch(/mood \(any log/);
    const otherShape = details[4]
      .split('For an idea or any other log:')[1]
      .split('For an event:')[0];
    expect(otherShape).toMatch(/"mood"/);
    const eventShape = details[3].split('For an event:')[1];
    expect(eventShape).toMatch(/"mood"/);
  });
});
