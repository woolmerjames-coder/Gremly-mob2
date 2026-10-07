/**
 * @jest-environment node
 *
 * A correction never marks Gremly's words as the person's, and never writes
 * over words the person wrote themselves.
 */
import { correctedField, isTheirs } from '../corrections';

jest.mock('../db', () => ({ ...jest.requireActual('../db'), db: jest.fn() }));
jest.mock('../llm', () => ({ jsonCall: jest.fn(), modelFor: jest.fn() }));

describe('what a correction writes on a World or a Chapter', () => {
  it('writes the words and when, and leaves who wrote them alone', () => {
    const body = correctedField(
      'summary',
      'A made up line, put right.',
      '2026-10-07T12:00:00.000Z',
    );
    expect(body).toEqual({
      summary: 'A made up line, put right.',
      summary_updated_at: '2026-10-07T12:00:00.000Z',
    });
    expect(Object.keys(body).some((k) => k.endsWith('_source'))).toBe(false);
  });

  it('knows a field the person wrote themselves, and only that', () => {
    const row = {
      card_subtitle_source: 'user',
      summary_source: 'synthesis',
      epigraph_source: null,
    };
    expect(isTheirs(row, 'card_subtitle')).toBe(true);
    expect(isTheirs(row, 'summary')).toBe(false);
    expect(isTheirs(row, 'epigraph')).toBe(false);
    expect(isTheirs(null, 'summary')).toBe(false);
  });
});
