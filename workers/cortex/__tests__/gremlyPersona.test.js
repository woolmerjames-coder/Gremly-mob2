/**
 * @jest-environment node
 *
 * What every chat reply is told about saving. Ask Gremly (the general chat)
 * saves through its Save items pill after the reply, so its reply is never
 * asked to write a save block: that told it that it saves things, and it
 * promised to. Space chat still reads the block.
 */
import {
  APP_NOW,
  MODE_TEMPLATES,
  assembleGenerationConfig,
  buildGeneralChatConfig,
  chatAgentPersona,
  chatTurnGuidance,
} from '../gremlyPersona.js';
import { HABIT_BUILDER_PROMPT } from '../habitBuilderPrompt.js';
import { JUST_HAPPENED_RULE } from '../../shared/lifePack.js';
import { SOURCE_RULES, SOURCE_RULES_AGENT, PRIVATE_RULES } from '../../inngest-jobs/careRules.js';

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

test('every chat, and the agent, is given the private rules every writer about their life is given', () => {
  const general = buildGeneralChatConfig(triage, { runningSummary: '' }, null, '', '', 'UTC');
  expect(general.systemPrompt).toContain(PRIVATE_RULES);
  for (const chatType of ['entity', 'space', 'world', 'chapter']) {
    const { systemPrompt } = assembleGenerationConfig({
      triage,
      chatType,
      currentDate: 'Wednesday',
    });
    expect(systemPrompt).toContain(PRIVATE_RULES);
  }
  expect(chatAgentPersona()).toContain(PRIVATE_RULES);
});

test('the rule names no source for Gremly to fall back on, and never another person', () => {
  for (const rules of [SOURCE_RULES, SOURCE_RULES_AGENT]) {
    expect(rules).toContain('is the only thing that can tell you where something came from');
    expect(rules).toContain('name no day, place or words of theirs');
    expect(rules).toContain('never say or suggest that it came from anyone else');
  }
});

// data fabric stage 4e: asking after what has just happened, and what the agent is told of triage

test('both lanes of Ask Gremly ask after what has just happened, by the shared rule', () => {
  const general = buildGeneralChatConfig(
    { mode: 'chit_chat', depth: 'brief', personal: 'none', search: 'none' },
    { runningSummary: '' },
    null,
    '',
    '',
    'UTC',
  );
  expect(general.systemPrompt).toContain(JUST_HAPPENED_RULE);
  expect(general.systemPrompt).toMatch(
    /something that has just happened that they haven't told you about yet/,
  );
  expect(chatAgentPersona()).toContain(JUST_HAPPENED_RULE);
});

test('what the agent is told of triage has no dashes, and nothing for a message about getting something done', () => {
  for (const mode of ['emotional', 'venting', 'accountability', 'celebration']) {
    const g = chatTurnGuidance({ mode, personal: 'light' });
    expect(g.startsWith('HOW THIS MESSAGE READS\n')).toBe(true);
    expect(g).not.toMatch(/\s[-–—]\s|—/);
  }
  expect(chatTurnGuidance({ mode: 'action_ready', personal: 'none' })).toBe('');
  expect(chatTurnGuidance(null)).toBe('');
});

test('how the app works is told as it is now, once, to every writer in Ask Gremly', () => {
  // Spaces, the Sweep and Guides and Logs are gone (Stage 4f of the Worlds rebuild)
  const gone = /\bSpaces?\b(?! are gone)|\bsweep\b|guides? (&|and) logs/i;
  expect(MODE_TEMPLATES.app_help).toContain(APP_NOW);
  expect(MODE_TEMPLATES.app_help.replace('Spaces are gone', '')).not.toMatch(gone);
  expect(APP_NOW).not.toMatch(/\s[-–—]\s|—/);
  const count = (s) => s.split(APP_NOW).length - 1;
  for (const mode of ['app_help', 'quick_ask', 'chit_chat']) {
    const { systemPrompt } = buildGeneralChatConfig(
      { ...triage, mode },
      { runningSummary: '' },
      null,
      '',
      '',
      'UTC',
    );
    expect(count(systemPrompt)).toBe(1);
    expect(systemPrompt).not.toContain('not scoped to any Space');
  }
  expect(count(chatAgentPersona())).toBe(1);
  expect(HABIT_BUILDER_PROMPT).not.toMatch(/\bSpaces?\b/);
});
