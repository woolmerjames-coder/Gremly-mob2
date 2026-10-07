/**
 * @jest-environment node
 *
 * What every chat reply is told about saving. Ask Gremly (the general chat)
 * saves through its Save items pill after the reply, so its reply is never
 * asked to write a save block: that told it that it saves things, and it
 * promised to. Space chat still reads the block.
 */
import {
  assembleGenerationConfig,
  buildGeneralChatConfig,
  chatAgentPersona,
} from '../gremlyPersona.js';
import { SOURCE_RULES, SOURCE_RULES_AGENT } from '../../inngest-jobs/careRules.js';

const triage = { mode: 'capture', depth: 'brief', personal: 'none', search: 'none' };

test('Ask Gremly is never asked for a save block; space chat still is', () => {
  const general = buildGeneralChatConfig(triage, { runningSummary: '' }, null, '', '', 'UTC');
  expect(general.systemPrompt).not.toContain('<!--SAVE:');
  const space = assembleGenerationConfig({ triage, chatType: 'space', currentDate: 'Wednesday' });
  expect(space.systemPrompt).toContain('<!--SAVE:');
});

test('every reply knows the app saves new things after it, and what a general word for an item means', () => {
  const { systemPrompt } = buildGeneralChatConfig(
    triage,
    { runningSummary: '' },
    null,
    '',
    '',
    'UTC',
  );
  expect(systemPrompt).toContain(
    'the app offers to save it right after your reply and they decide',
  );
  expect(systemPrompt).toContain(
    "The app's own words for their todos, habits and notes are items and entities.",
  );
  expect(systemPrompt).toContain('Reply briefly about the thing itself');
});

test('Ask Gremly is told how the conversation should feel; space chat is not, yet', () => {
  const general = buildGeneralChatConfig(triage, { runningSummary: '' }, null, '', '', 'UTC');
  expect(general.systemPrompt).toContain('=== HOW THE CONVERSATION FEELS ===');
  const space = assembleGenerationConfig({ triage, chatType: 'space', currentDate: 'Wednesday' });
  expect(space.systemPrompt).not.toContain('=== HOW THE CONVERSATION FEELS ===');
});

test('every chat is told how to say where something Gremly knows came from', () => {
  // a writer that answers from what it is given: Ask Gremly's quick lane, and a chat about an item, a space, a World or a Chapter
  const general = buildGeneralChatConfig(triage, { runningSummary: '' }, null, '', '', 'UTC');
  expect(general.systemPrompt).toContain(SOURCE_RULES);
  for (const chatType of ['entity', 'space', 'world', 'chapter']) {
    const { systemPrompt } = assembleGenerationConfig({
      triage,
      chatType,
      currentDate: 'Wednesday',
    });
    expect(systemPrompt).toContain(SOURCE_RULES);
  }
  // the agent can look a record up, and is told to look only when the source is not in front of it
  expect(chatAgentPersona()).toContain(SOURCE_RULES_AGENT);
  expect(chatAgentPersona()).not.toContain(SOURCE_RULES);
});

test('the rule names no source for Gremly to fall back on, and never another person', () => {
  for (const rules of [SOURCE_RULES, SOURCE_RULES_AGENT]) {
    expect(rules).toContain('is the only thing that can tell you where something came from');
    expect(rules).toContain('name no day, place or words of theirs');
    expect(rules).toContain('never say or suggest that it came from anyone else');
  }
});
