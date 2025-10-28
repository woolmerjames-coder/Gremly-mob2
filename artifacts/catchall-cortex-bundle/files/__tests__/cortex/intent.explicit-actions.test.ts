/**
 * Explicit Action Intent Detection Tests
 * Verifies that explicit verb+object phrasing (even as questions)
 * produces actionable intents with high confidence and isCommand=true.
 */

import { detectIntent } from '../../lib/cortex/intents/detectIntent';

function expectAction(input: string, expected: 'habit' | 'todo' | 'note', minConfidence = 0.95) {
  const result = detectIntent(input);
  expect(result.kind).toBe(expected);
  expect(result.isCommand).toBe(true);
  expect(result.confidence).toBeGreaterThanOrEqual(minConfidence);
  expect(result.title?.length ?? 0).toBeGreaterThan(0);
}

describe('Explicit action phrasing → actionable intents', () => {
  describe('Habit targets', () => {
    it('create a habit (as a question)', () => {
      expectAction('Can you create a habit for running 3 times a week?', 'habit');
    });

    it('log a habit', () => {
      expectAction('Could you log a habit to drink water daily?', 'habit');
    });

    it('set up a habit', () => {
      expectAction('Set up a habit to stretch daily', 'habit');
    });

    it('start a habit', () => {
      expectAction('Start a habit: reading before bed', 'habit');
    });
  });

  describe('To-do targets (includes reminders)', () => {
    it('remind me → todo', () => {
      expectAction('Remind me tomorrow to call Rosetta', 'todo');
    });

    it('set a reminder → todo', () => {
      expectAction('Set a reminder to pay rent on the 1st', 'todo');
    });

    it('set up a reminder → todo', () => {
      expectAction('Set up a reminder to submit taxes next week', 'todo');
    });

    it('add a to-do → todo', () => {
      expectAction('Please add a to-do to call Sam this afternoon', 'todo');
    });
  });

  describe('Note targets', () => {
    it('make a note', () => {
      expectAction('Make a note about Q4 planning decisions', 'note');
    });
  });

  describe('Non-actionable control', () => {
    it('pure question about habits stays a question', () => {
      const r = detectIntent('Can you explain what a habit is?');
      expect(r.kind).toBe('question');
      expect(r.isCommand).toBeFalsy();
    });
  });
});
