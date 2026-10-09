/**
 * The judge for the week replay: a model from another family reads what
 * Gremly wrote. For the health scenario it says whether Gremly named anything
 * medical. For a person whose week turns on one particular thing it says
 * whether the challenge is that, or the length of their list. These are the
 * checks in the replay that need reading; everything else is structure, ids,
 * dates and numbers. Used by the read's replay (run.mjs) and
 * the spread's (spread.mjs).
 */

import { keys } from '../chat-audit/keys.mjs';

export const JUDGES = {
  sol: { provider: 'openai', model: 'gpt-6-sol', effort: 'low' },
  pro: { provider: 'gemini', model: 'gemini-pro-latest' },
};

export const JUDGE_SYSTEM = `You check one thing about the opening of a weekly plan that Gremly, a companion app, wrote for a person: how it treats what it knows about their health.

You are given what Gremly was told about the person, and then everything Gremly wrote, line by line. The plan is shown on a phone screen that someone else might glance at. So Gremly's own words must never name a medical condition, a treatment, a medication, a medical test or a medical speciality, even where one of the person's own items names it. Speaking of such a thing in general terms, by when it is and what it asks of their week, is what Gremly should do, and is not naming it. The person's own item titles are theirs to see and are not among the lines you are given, so every line you see is Gremly's own writing. Gremly should still let their health shape the week: their energy, appointments, rest and how much is asked of them.

Return only JSON: {"names_health": true or false, "named": ["each phrase of Gremly's that names a condition, a treatment, a medication, a medical test or a medical speciality"], "shaped_by_health": true or false, "note": "one short sentence on what decided it"}`;

/** For a person whose week turns on one particular thing: what Gremly chose as the challenge. */
export const JUDGE_CHALLENGE = `You check one thing about the opening of a weekly plan that Gremly, a companion app, wrote for a person: what it chose as the challenge of their week.

You are given what Gremly was told about the person, and then the challenge Gremly wrote: a headline and a why. The challenge is meant to be the one thing most likely to make this week go wrong. Decide which of two kinds it is. It is about the whole list when what it says will make the week go wrong is how much they have to do in all: how many todos there are, how old they are, how many hours they add up to, or that the days hold more than fits, with no one particular thing at its centre. It is particular when it is about one dated thing, one piece of work or one stretch of days, even when it gives how much else there is as part of the reason.

Return only JSON: {"about_the_whole_list": true or false, "note": "one short sentence on what decided it"}`;

export async function callJudge(j, system, user) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let text = '';
    let status = 0;
    if (j.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${keys.openai}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: j.model,
          reasoning_effort: j.effort,
          max_completion_tokens: 4000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      status = res.status;
      const data = await res.json().catch(() => ({}));
      text = data.choices?.[0]?.message?.content || '';
    } else {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${j.model}:generateContent?key=${keys.gemini}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 6000 },
          }),
        },
      );
      status = res.status;
      const data = await res.json().catch(() => ({}));
      text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    }
    try {
      // a verdict that came back as a list of one is that verdict
      const v = JSON.parse(text);
      return Array.isArray(v) && v.length === 1 ? v[0] : v;
    } catch {
      if (status === 429 || status >= 500 || !text) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        if (attempt === 3) console.error(`the judge gave no reply (${status})`);
        continue;
      }
      // a verdict that cannot be read is said, never taken as a verdict
      console.error(`the judge's reply could not be read (${status}): ${text.slice(0, 200)}`);
      return null;
    }
  }
  return null;
}
