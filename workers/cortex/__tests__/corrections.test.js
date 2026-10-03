/**
 * @jest-environment node
 *
 * Corrections in chat (context/corrections.js): only the message the person has
 * just sent is checked, so a correction said earlier in the conversation is
 * filed once, on its own turn, and never again on the turns after it.
 */
import { checkForCorrection } from '../context/corrections.js';
import { configureModels } from '../models.js';

const USER = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';
const CHAT = '3c9f1a52-7d1e-4b8a-9c3f-5e6d7a8b9c0d';
const ENV = { INNGEST_WORKER_URL: 'https://inngest.test', INNGEST_ADMIN_KEY: 'admin' };

const EARLIER = 'I moved the call with my parents to today, I thought you knew';
const CONVERSATION = [
  'Gremly: Your call with your parents is on Sunday.',
  `User: ${EARLIER}`,
  'Gremly: Got it, today it is.',
  'User: what is on next week?',
].join('\n\n');

function stub(corrections) {
  const calls = { model: [], filed: [] };
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).startsWith('https://inngest.test')) {
      calls.filed.push({ url, body });
      return new Response('{}', { status: 200 });
    }
    calls.model.push(body);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ corrections }) } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };
  return calls;
}

beforeEach(() => configureModels({ OPENAI_API_KEY: 'k' }));
afterEach(() => {
  configureModels({});
  delete globalThis.fetch;
});

test('a correction in the message just sent is filed, with the thread it was said in', async () => {
  const calls = stub([{ said: 'it is on Saturday, not Sunday', about: 'the day of the call' }]);
  const r = await checkForCorrection({
    conversationText: 'Gremly: Your call with your parents is on Sunday.',
    latest: 'No, it is on Saturday, not Sunday',
    chatId: CHAT,
    userId: USER,
    env: ENV,
    surface: 'brief',
  });
  expect(r).toEqual({ sent: 1 });
  expect(calls.filed).toHaveLength(1);
  expect(calls.filed[0].url).toBe('https://inngest.test/api/correction');
  expect(calls.filed[0].body).toMatchObject({
    user_id: USER,
    said: 'it is on Saturday, not Sunday',
    surface: 'brief',
    chat_id: CHAT,
  });
});

test('the model is shown the message just sent apart from the conversation before it', async () => {
  const calls = stub([]);
  await checkForCorrection({
    conversationText: CONVERSATION,
    latest: 'what is on next week?',
    chatId: CHAT,
    userId: USER,
    env: ENV,
  });
  const system = calls.model[0].messages[0].content;
  expect(system).toContain(`CONVERSATION\n${CONVERSATION}`);
  expect(system).toContain('THE MESSAGE THEY HAVE JUST SENT\nwhat is on next week?');
});

test('a correction from an earlier message is never filed again on a later turn', async () => {
  // the model points at the earlier message anyway: it was filed on its own turn
  const calls = stub([{ said: EARLIER, about: 'the day of the call' }]);
  const r = await checkForCorrection({
    conversationText: CONVERSATION,
    latest: 'what is on next week?',
    chatId: CHAT,
    userId: USER,
    env: ENV,
  });
  expect(r).toEqual({ sent: 0 });
  expect(calls.filed).toHaveLength(0);
});

test('with no message to check, nothing is asked or filed', async () => {
  const calls = stub([{ said: EARLIER, about: 'x' }]);
  const r = await checkForCorrection({
    conversationText: CONVERSATION,
    latest: '  ',
    userId: USER,
    env: ENV,
  });
  expect(r).toEqual({ sent: 0 });
  expect(calls.model).toHaveLength(0);
});
