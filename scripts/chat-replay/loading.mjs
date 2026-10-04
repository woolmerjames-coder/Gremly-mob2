/**
 * The loading line Ask Gremly shows while it works (triage.js
 * generateLoadingMessage), on two models side by side: the words and the
 * time each takes. The messages are the chat replay's, all made up.
 *
 *   scripts/chat-replay/loading.sh [--models gpt-4.1-mini,gpt-6-luna] [--repeat n]
 *
 * OPENAI_API_KEY comes from the environment.
 */

import { configureModels } from '../../workers/cortex/models.js';
import { generateLoadingMessage } from '../../workers/cortex/triage.js';
import { SCENARIOS } from './scenarios.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const models = (flag('--models') || 'gpt-4.1-mini,gpt-6-luna').split(',');
const repeat = Math.max(1, Number(flag('--repeat') || 2));
const texts = [
  ...SCENARIOS.map((s) => s.text),
  "What's coming up this week?",
  'Help me think through something',
  'How am I doing with my habits?',
  "What's on tomorrow?",
  'I feel like I got nothing done today',
  'Can you help me plan a birthday dinner for Jo?',
];

const byModel = {};
for (const model of models) {
  configureModels({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    HELPER_MODEL: model,
    MODEL_LOADING_MESSAGE: model,
  });
  const rows = [];
  for (const text of texts) {
    for (let i = 0; i < repeat; i++) {
      const t0 = Date.now();
      const line = await generateLoadingMessage(text, null, process.env.OPENAI_API_KEY);
      rows.push({ text, line, ms: Date.now() - t0 });
    }
  }
  byModel[model] = rows;
}

for (const text of texts) {
  console.log(`\n${text.slice(0, 90)}`);
  for (const model of models)
    console.log(
      `  ${model.padEnd(14)} ${byModel[model]
        .filter((r) => r.text === text)
        .map((r) => `${r.line ?? '(none)'} [${r.ms}ms]`)
        .join('  |  ')}`,
    );
}
console.log('\nModel · median time · slowest · lines missing');
for (const model of models) {
  const ms = byModel[model].map((r) => r.ms).sort((a, b) => a - b);
  const missing = byModel[model].filter((r) => !r.line).length;
  console.log(
    `  ${model.padEnd(14)} ${ms[Math.floor(ms.length / 2)]}ms · ${ms.at(-1)}ms · ${missing} of ${ms.length}`,
  );
}
