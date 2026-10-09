import { briefNoCardSection, briefQuestionSection } from '../briefTurn.js';

describe('the reply to the brief’s question', () => {
  it('names the question and keeps the reply to it', () => {
    const out = briefQuestionSection("Is Pepper's vet appointment on October 1 or October 2?");
    expect(out).toContain("=== THE BRIEF'S QUESTION ===");
    expect(out).toContain('"Is Pepper\'s vet appointment on October 1 or October 2?"');
    expect(out).toContain('do not ask a question of your own');
  });

  it('adds nothing without a question', () => {
    expect(briefQuestionSection(null)).toBe('');
    expect(briefQuestionSection('   ')).toBe('');
    expect(briefQuestionSection({ q: 'x' })).toBe('');
  });

  it('keeps a long question to one short line', () => {
    const out = briefQuestionSection(`${'word '.repeat(200)}\n\nmore`);
    const quoted = out.split('"')[1];
    expect(quoted.length).toBeLessThanOrEqual(300);
    expect(quoted).not.toContain('\n');
  });
});

describe('today’s thread with no card', () => {
  it('says nothing changes this turn, so nothing is claimed', () => {
    const out = briefNoCardSection();
    expect(out).toContain('nothing about them changes from it');
    expect(out).toContain('Never say or imply');
  });
});
