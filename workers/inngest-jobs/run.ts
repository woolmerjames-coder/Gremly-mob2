import 'dotenv/config';
import * as fs from 'fs';
import {
  generateAdaptiveSummary,
  type GenerateResult,
  type SurfacedObservationRow,
} from './generateAdaptiveSummary';
import { renderInspectionDocument } from './summaryRender';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// Flags (env vars):
//   CLEAN=true             remove today's shadow surfaced rows before generating (repeatable runs)
//   PERSIST_SURFACED=false skip persisting surfaced rows. Default = persist (closes recency loop)
//   DUAL_RUN=true          run twice per user with persistence between passes to exercise recency
const CLEAN = process.env.CLEAN === 'true';
const PERSIST = process.env.PERSIST_SURFACED !== 'false';
const DUAL_RUN = process.env.DUAL_RUN === 'true';

const fetchRows = async (path: string): Promise<unknown[]> => {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers });
  if (!r.ok) throw new Error(`fetchRows ${path}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<unknown[]>;
};
const runRpc = async (fn: string, params: Record<string, unknown>): Promise<unknown> => {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  if (!r.ok) throw new Error(`rpc ${fn}: ${r.status} ${await r.text()}`);
  return r.json();
};

const ANALYST_WEEK_START = '2026-05-18';
const ANALYST_WEEK_END = '2026-05-24';

const USERS = [
  { label: 'James', userId: '05a3c53d-b242-4b5f-a0db-83004c8e3892', file: 'james_deck.html' },
  { label: 'Dave', userId: 'c7674834-114b-4f6d-ac57-4d18aec8393b', file: 'dave_deck.html' },
  { label: 'Tina', userId: 'c64ec85f-735c-4d5c-859a-1ac6630aebb3', file: 'tina_deck.html' },
];

async function clearShadowSurfacedForUserWeek(userId: string, weekStart: string): Promise<void> {
  const path =
    `observations?user_id=eq.${userId}&stage=eq.summary&observed_for_week=eq.${weekStart}` +
    `&surfaced_in_summary_id=is.null`;
  const r = await fetch(`${URL}/rest/v1/${path}`, { method: 'DELETE', headers });
  if (!r.ok && r.status !== 404)
    throw new Error(`clear shadow surfaced: ${r.status} ${await r.text()}`);
}

async function persistSurfaced(rows: SurfacedObservationRow[]): Promise<void> {
  if (rows.length === 0) return;
  const insertPayload = rows.map((r) => {
    const { client_ref, ...rest } = r;
    void client_ref;
    return rest;
  });
  const r = await fetch(`${URL}/rest/v1/observations`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(insertPayload),
  });
  if (!r.ok) throw new Error(`persist surfaced: ${r.status} ${await r.text()}`);
}

async function cleanTodaysShadowRows(): Promise<void> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const cutoff = todayStart.toISOString();
  const path = `observations?stage=eq.summary&surfaced_at=gte.${cutoff}&surfaced_in_summary_id=is.null`;
  const r = await fetch(`${URL}/rest/v1/${path}`, { method: 'DELETE', headers });
  if (!r.ok && r.status !== 404) throw new Error(`CLEAN: ${r.status} ${await r.text()}`);
  console.log(`[CLEAN] removed today's shadow surfaced rows (cutoff ${cutoff})`);
}

async function runOne(
  label: string,
  userId: string,
  passSuffix = '',
): Promise<{ html: string; ok: boolean; cards: number }> {
  const res: GenerateResult = await generateAdaptiveSummary({
    userId,
    weekStart: ANALYST_WEEK_START,
    weekEnd: ANALYST_WEEK_END,
    label,
    env: { ANTHROPIC_API_KEY },
    runRpc,
    fetchRows,
  });

  const cards = res.content?.cards.length ?? 0;
  console.log(`\n--- ${label}${passSuffix ? ' / ' + passSuffix : ''} ---`);
  console.log(`classification: ${res.content?.classification ?? '(none)'}`);
  console.log(`through_line: ${res.content?.through_line ?? '(none)'}`);
  console.log(`cards: ${cards}`);
  if (res.content) {
    for (const c of res.content.cards) {
      const head = (c.headline || '').slice(0, 80);
      console.log(`  [${c.shape}] ${head}`);
    }
  }
  if (res.errors.length > 0) {
    console.log(`errors: ${res.errors.join(' | ')}`);
  }

  if (PERSIST && res.surfaced_observations.length > 0 && cards > 0) {
    await clearShadowSurfacedForUserWeek(userId, ANALYST_WEEK_START);
    await persistSurfaced(res.surfaced_observations);
    console.log(`-> persisted ${res.surfaced_observations.length} surfaced anchors`);
  }

  return { html: res.html, ok: cards > 0, cards };
}

async function main(): Promise<void> {
  if (CLEAN) await cleanTodaysShadowRows();

  // Pass 1 (or only pass)
  const pass1Sections: string[] = [];
  for (const u of USERS) {
    const out = await runOne(u.label, u.userId);
    pass1Sections.push(out.html);
    const file = DUAL_RUN ? u.file.replace('.html', '_pass1.html') : u.file;
    fs.writeFileSync(`./${file}`, renderInspectionDocument([out.html]));
    console.log(`-> wrote ${file}`);
  }
  // Combined file for convenience
  fs.writeFileSync(
    `./${DUAL_RUN ? 'all_three_decks_pass1.html' : 'all_three_decks.html'}`,
    renderInspectionDocument(pass1Sections),
  );

  if (DUAL_RUN) {
    // Pass 2: recency rows from pass 1 are now in the DB; the writer sees them
    const pass2Sections: string[] = [];
    for (const u of USERS) {
      const out = await runOne(u.label, u.userId, 'pass 2');
      pass2Sections.push(out.html);
      const file = u.file.replace('.html', '_pass2.html');
      fs.writeFileSync(`./${file}`, renderInspectionDocument([out.html]));
      console.log(`-> wrote ${file}`);
    }
    fs.writeFileSync('./all_three_decks_pass2.html', renderInspectionDocument(pass2Sections));
  }

  console.log('\nDone. Open the all_three_decks*.html file in a browser.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
