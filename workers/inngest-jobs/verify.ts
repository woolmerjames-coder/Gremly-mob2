import * as fs from 'fs';
import { LEDGER_DETECTORS } from './summaryLedgerDetectors';
import { clusterCandidates } from './summaryCompose';
import { filterByRecency, type PriorSurfaced, type DetectorRecency } from './summaryFilter';
import type { AnalystObservation, DetectContext, Candidate } from './summaryTypes';

const OBS = JSON.parse(fs.readFileSync('./dave_obs.json', 'utf8')) as AnalystObservation[];

async function main() {
  const ctx = {
    userId: 'dave',
    weekStart: '2026-05-18',
    weekEnd: '2026-05-24',
    env: {},
    runDetectorSql: async () => ({}),
    fetchRows: async () => [],
    analystObservations: OBS,
  } as DetectContext;

  const fired: Candidate[] = [];
  for (const d of LEDGER_DETECTORS) fired.push(...(await d.detect(ctx)));
  console.log(`\nDETECT: ${fired.length} from ${OBS.length}`);

  const { representatives, log } = clusterCandidates(fired);
  console.log(`\nCLUSTER: ${fired.length} -> ${representatives.length} representatives`);
  for (const l of log) {
    console.log(`  REP ${l.representative}`);
    for (const a of l.absorbed) console.log(`      <- ${a.detector_id} "${a.subject}"`);
  }

  const recency: Record<string, DetectorRecency> = {};
  for (const d of LEDGER_DETECTORS)
    recency[d.id] = {
      recency_window_weeks: d.recency_window_weeks ?? 4,
      evolution_similarity_threshold: d.evolution_similarity_threshold ?? 0.5,
    };
  const prior: PriorSurfaced[] = [
    {
      id: 'p1',
      detector_id: 'ambient_meta_theme',
      subject: 'Capacity management and triage priorities',
      evidence_snapshot: {
        valence_trend: 'acute crisis-driven exhaustion',
        claim: 'acute crisis response',
      },
      surfaced_at: '2026-05-18T09:00:00Z',
      observed_for_week: '2026-05-11',
    },
    {
      id: 'p2',
      detector_id: 'named_person_arc',
      subject: 'James and relational presence',
      evidence_snapshot: { valence_trend: 'steady warmth' },
      surfaced_at: '2026-05-18T09:00:00Z',
      observed_for_week: '2026-05-11',
    },
  ];
  const outcomes = filterByRecency(
    representatives,
    prior,
    recency,
    new Date('2026-05-26T00:00:00Z'),
  );
  console.log(`\nFILTER:`);
  for (const o of outcomes)
    console.log(
      `  ${o.decision.toUpperCase().padEnd(9)} ${o.candidate.detector_id.padEnd(20)} "${o.candidate.dedup_key}" (${o.reason})`,
    );
}
main();
