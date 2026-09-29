// ============================================================================
// helperClient.js: one door for the helper calls around a chat turn.
//
// Every helper job (triage, loading line, summaries, extraction, habit pre
// parse and so on) used to be a direct request to OpenAI's chat completions
// endpoint. models.js made the model a config value; this file makes the
// provider follow the model, so a job can move to Gemini (or back) with one
// Worker var and no code change.
//
// The call sites keep building the OpenAI shaped body they always built and
// keep parsing an OpenAI shaped reply. For an OpenAI model the request goes
// out exactly as before. For an OpenAI reasoning model the body takes the
// shape that family needs (max_completion_tokens, reasoning effort, no
// temperature). For a Gemini model the request is translated to
// generateContent and the reply is wrapped back into the OpenAI shape.
// ============================================================================

import { models, helperModel } from './models.js';
import { geminiGenerate } from './geminiClient.js';
import { isOpenAIReasoningModel, openAIMinimalEffort } from './aiProvider.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export function providerFor(model) {
  if (/^gemini/i.test(model || '')) return 'gemini';
  if (/^claude/i.test(model || '')) return 'anthropic';
  return 'openai';
}

// Thinking and reasoning tokens count against the output cap on Gemini and on
// OpenAI reasoning models, so those get headroom above the cap the call site
// meant for the answer itself.
function capWithHeadroom(body) {
  const cap = body.max_completion_tokens ?? body.max_tokens ?? 500;
  return Math.max(cap * 4, 1024);
}

/**
 * @param {string} job a key of HELPER_JOB_VARS in models.js
 * @param {object} body the OpenAI chat completions body: messages, max_tokens or
 *   max_completion_tokens, temperature, response_format. `model` is set here.
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<Response>} a Response whose JSON is OpenAI shaped
 */
export async function helperFetch(job, body, opts = {}) {
  const model = helperModel(job);
  const keys = models().keys || {};
  const provider = providerFor(model);

  if (provider === 'openai') {
    const b = { ...body, model };
    if (isOpenAIReasoningModel(model)) {
      const cap = capWithHeadroom(b);
      delete b.max_tokens;
      delete b.temperature;
      b.max_completion_tokens = cap;
      const effort = openAIMinimalEffort(model);
      if (effort) b.reasoning_effort = effort;
    }
    return fetch(OPENAI_URL, {
      method: 'POST',
      signal: opts.signal,
      headers: { Authorization: `Bearer ${keys.openai}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    });
  }

  if (provider === 'gemini') {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => String(m.content ?? ''))
      .join('\n\n');
    const rest = messages.filter((m) => m.role !== 'system');
    const config = {
      model,
      temperature: body.temperature,
      maxOutputTokens: capWithHeadroom(body),
      thinkingLevel: 'low',
      label: job,
    };
    if (body.response_format?.type === 'json_object') config.responseMimeType = 'application/json';
    const r = await geminiGenerate(system, rest, config, keys.google);
    const payload = r.ok
      ? {
          id: `helper-${job}`,
          object: 'chat.completion',
          model,
          choices: [
            { index: 0, message: { role: 'assistant', content: r.content }, finish_reason: 'stop' },
          ],
          usage: {
            prompt_tokens: r.usage?.promptTokenCount ?? 0,
            completion_tokens: r.usage?.candidatesTokenCount ?? 0,
          },
        }
      : { error: { message: r.error || 'gemini error', provider: 'gemini' } };
    return new Response(JSON.stringify(payload), {
      status: r.ok ? 200 : r.status || 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  throw new Error(`helperClient: no provider for model "${model}" (job ${job})`);
}
