/**
 * @jest-environment node
 *
 * What every chat reply is told about saving. Ask Gremly (the general chat)
 * saves through its Save items pill after the reply, so its reply is never
 * asked to write a save block: that told it that it saves things, and it
 * promised to. Space chat still reads the block.
 */
import { assembleGenerationConfig, buildGeneralChatConfig } from '../gremlyPersona.js';

const triage = { mode: 'capture', depth: 'brief', personal: 'none', search: 'none' };

test('Ask Gremly is never asked for a save block; space chat still is', () => {
  const general = buildGeneralChatConfig(triage, { runningSummary: '' }, null, '', '', 'UTC');
  expect(general.systemPrompt).not.toContain('<!--SAVE:');
  const space = assembleGenerationConfig({ triage, chatType: 'space', currentDate: 'Wednesday' });
  expect(space.systemPrompt).toContain('<!--SAVE:');
});

test('every reply knows the app saves new things after it, and what a general word for an item means', () => {
  const { systemPrompt } = buildGeneralChatConfig(triage, { runningSummary: '' }, null, '', '', 'UTC');
  expect(systemPrompt).toContain('the app offers to save it right after your reply and they decide');
  expect(systemPrompt).toContain("The app's own words for their todos, habits and notes are items and entities.");
  expect(systemPrompt).toContain('Reply briefly about the thing itself');
});
