import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

import type { CortexInput, CortexOutput } from '../../cortex/ICortexEngine';
import { classifyTextForEval } from '../../cortex/openAiEngine';
import { normalizeTags } from '../../lib/tags/normalize';

export type TagEvalSample = {
  id: string;
  text: string;
  expected?: {
    typeTag?: string;
    topics?: string[];
    emotions?: string[];
  };
};

const repoRoot = process.cwd();
const requireJson = createRequire(path.join(repoRoot, 'package.json'));
const samplesPath = path.resolve(repoRoot, 'artifacts', 'tags-eval', 'samples.v1.json');
const reportDir = path.resolve(repoRoot, 'artifacts', 'tags-eval', 'report');
const samples = requireJson(samplesPath) as TagEvalSample[];

const EMOTION_TAGS = new Set([
  '#anxious',
  '#grateful',
  '#excited',
  '#overwhelmed',
  '#calm',
  '#stressed',
]);
const TOPIC_TAG_LIMIT = 3;

type EvalResult = {
  raw: CortexOutput;
  finalTags: string[];
  latencyMs: number | null;
};

async function loadClassifier(): Promise<(input: CortexInput) => Promise<EvalResult>> {
  try {
    if (!process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL) {
      process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL = 'true';
    }
    if (!process.env.EXPO_PUBLIC_CORTEX_ENGINE) {
      process.env.EXPO_PUBLIC_CORTEX_ENGINE = 'HEURISTIC';
    }

    return async (input: CortexInput) => classifyTextForEval(input.text ?? '');
  } catch (error) {
    console.warn('[tags-eval] Falling back to mock classifier:', error);
    return async ({ text }: CortexInput): Promise<EvalResult> => {
      const hashtagMatches = text ? (text.match(/#[a-z0-9_-]+/gi) ?? []) : [];
      const normalized = normalizeTags(hashtagMatches);
      const raw: CortexOutput = {
        type: 'note',
        subtype: 'catchall',
        aiPlaced: false,
        whyString: 'Mock classification fallback',
        tags: normalized,
      };
      return { raw, finalTags: normalized, latencyMs: null };
    };
  }
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringified = typeof value === 'string' ? value : String(value);
  if (/[",\n]/.test(stringified)) {
    return `"${stringified.replace(/"/g, '""')}"`;
  }
  return stringified;
}

function normalizeExpectedValues(values?: string[]): string[] {
  if (!values) return [];
  return normalizeTags(values);
}

function summarizeEmotionPrecision(tp: number, fp: number, fn: number) {
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;
  return { precision, recall, f1 };
}

export async function main(): Promise<void> {
  const classifier = await loadClassifier();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.mkdir(reportDir, { recursive: true });

  const typeCounts: Record<CortexOutput['type'], number> = {
    habit: 0,
    todo: 0,
    note: 0,
  };

  let missingTypeTagCount = 0;
  let totalTopicTags = 0;
  let totalEmotionTags = 0;
  let totalLatencyMs = 0;
  let latencyCount = 0;
  let minLatencyMs: number | null = null;
  let maxLatencyMs: number | null = null;
  let peopleFalsePositives = 0;
  let peopleTotal = 0;
  let samplesWithTypeTag = 0;

  let emotionTruePositives = 0;
  let emotionFalsePositives = 0;
  let emotionFalseNegatives = 0;

  const failuresByReason: Record<
    'missingTypeTag' | 'tooManyTopics' | 'emotionFalsePositive' | 'personFalsePositive',
    string[]
  > = {
    missingTypeTag: [],
    tooManyTopics: [],
    emotionFalsePositive: [],
    personFalsePositive: [],
  };

  const perSample: Array<{
    id: string;
    text: string;
    output?: CortexOutput;
    tags: string[];
    typeTag: string | null;
    topicTags: string[];
    emotionTags: string[];
    personTags: string[];
    expected: TagEvalSample['expected'] & {
      normalizedTypeTag: string | null;
      normalizedTopics: string[];
      normalizedEmotions: string[];
      normalizedPeople: string[];
    };
    metrics: {
      missingTypeTag: boolean;
      topicCount: number;
      emotion: {
        truePositives: number;
        falsePositives: number;
        falseNegatives: number;
        precision: number | null;
        recall: number | null;
      };
      latencyMs: number | null;
    };
    peopleFalsePositive: boolean;
    error?: string;
  }> = [];

  for (const sample of samples) {
    const id = sample.id ?? `sample-${perSample.length + 1}`;
    const normalizedExpectedType = normalizeExpectedValues(
      sample.expected?.typeTag ? [sample.expected.typeTag] : [],
    );
    const normalizedExpectedTopics = normalizeExpectedValues(sample.expected?.topics);
    const expectedTypeTag = normalizedExpectedType[0] ?? null;
    const expectedTopics = normalizedExpectedTopics.filter((tag) => tag.startsWith('#'));
    const expectedPeople = normalizedExpectedTopics.filter((tag) => tag.startsWith('@'));
    const expectedEmotions = normalizeExpectedValues(sample.expected?.emotions).filter((tag) =>
      EMOTION_TAGS.has(tag),
    );

    try {
      const result = await classifier({ text: sample.text, spaceId: null });
      const output = result.raw;
      typeCounts[output.type] += 1;

      const normalizedTags = result.finalTags;
      const typeTag = normalizedTags.find((tag) => tag.startsWith('*')) ?? null;
      const emotionTags = normalizedTags.filter((tag) => EMOTION_TAGS.has(tag));
      const topicTags = normalizedTags.filter(
        (tag) => tag.startsWith('#') && !EMOTION_TAGS.has(tag),
      );
      const personTags = normalizedTags.filter((tag) => tag.startsWith('@'));

      const missingTypeTag = !typeTag;
      if (missingTypeTag) missingTypeTagCount += 1;
      else samplesWithTypeTag += 1;

      totalTopicTags += topicTags.length;
      totalEmotionTags += emotionTags.length;
      peopleTotal += personTags.length;

      const latency =
        result.latencyMs !== null && Number.isFinite(result.latencyMs) ? result.latencyMs : null;
      if (latency !== null) {
        totalLatencyMs += latency;
        latencyCount += 1;
        minLatencyMs = minLatencyMs === null ? latency : Math.min(minLatencyMs, latency);
        maxLatencyMs = maxLatencyMs === null ? latency : Math.max(maxLatencyMs, latency);
      }

      const emotionSet = new Set(emotionTags);
      const expectedEmotionSet = new Set(expectedEmotions);

      const tp = emotionTags.filter((tag) => expectedEmotionSet.has(tag)).length;
      const fp = emotionTags.filter((tag) => !expectedEmotionSet.has(tag)).length;
      const fn = expectedEmotions.filter((tag) => !emotionSet.has(tag)).length;

      emotionTruePositives += tp;
      emotionFalsePositives += fp;
      emotionFalseNegatives += fn;

      const { precision, recall } = summarizeEmotionPrecision(tp, fp, fn);

      const expectedPeopleSet = new Set(expectedPeople);
      let samplePeopleFalsePositive = false;
      for (const tag of personTags) {
        if (!expectedPeopleSet.has(tag)) {
          peopleFalsePositives += 1;
          samplePeopleFalsePositive = true;
        }
      }

      const sampleEntry = {
        id,
        text: sample.text,
        output,
        tags: normalizedTags,
        typeTag,
        topicTags,
        emotionTags,
        personTags,
        expected: {
          ...sample.expected,
          normalizedTypeTag: expectedTypeTag,
          normalizedTopics: expectedTopics,
          normalizedEmotions: expectedEmotions,
          normalizedPeople: expectedPeople,
        },
        metrics: {
          missingTypeTag,
          topicCount: topicTags.length,
          emotion: {
            truePositives: tp,
            falsePositives: fp,
            falseNegatives: fn,
            precision,
            recall,
          },
          latencyMs: latency,
        },
        peopleFalsePositive: samplePeopleFalsePositive,
      };

      perSample.push(sampleEntry);

      if (missingTypeTag) failuresByReason.missingTypeTag.push(id);
      if (topicTags.length > TOPIC_TAG_LIMIT) failuresByReason.tooManyTopics.push(id);
      if (fp > 0) failuresByReason.emotionFalsePositive.push(id);
      if (samplePeopleFalsePositive) failuresByReason.personFalsePositive.push(id);
    } catch (error) {
      const sampleEntry = {
        id,
        text: sample.text,
        output: undefined,
        tags: [],
        typeTag: null,
        topicTags: [],
        emotionTags: [],
        personTags: [],
        expected: {
          ...sample.expected,
          normalizedTypeTag: expectedTypeTag,
          normalizedTopics: expectedTopics,
          normalizedEmotions: expectedEmotions,
          normalizedPeople: expectedPeople,
        },
        metrics: {
          missingTypeTag: true,
          topicCount: 0,
          emotion: {
            truePositives: 0,
            falsePositives: 0,
            falseNegatives: expectedEmotions.length,
            precision: null,
            recall: expectedEmotions.length > 0 ? 0 : null,
          },
          latencyMs: null,
        },
        peopleFalsePositive: false,
        error: error instanceof Error ? error.message : String(error),
      };

      perSample.push(sampleEntry);
      failuresByReason.missingTypeTag.push(id);
    }
  }

  const emotionSummary = summarizeEmotionPrecision(
    emotionTruePositives,
    emotionFalsePositives,
    emotionFalseNegatives,
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    datasetSize: samples.length,
    metrics: {
      typeCounts,
      missingTypeTagCount,
      missingTypeTagRate: samples.length > 0 ? missingTypeTagCount / samples.length : 0,
      samplesWithTypeTag,
      samplesWithTypeTagRate: samples.length > 0 ? samplesWithTypeTag / samples.length : 0,
      averageTopicTags: samples.length > 0 ? totalTopicTags / samples.length : 0,
      averageEmotionTags: samples.length > 0 ? totalEmotionTags / samples.length : 0,
      emotionPrecision: emotionSummary.precision,
      peopleFalsePositiveRate: peopleTotal > 0 ? peopleFalsePositives / peopleTotal : null,
      latencyMs: {
        min: minLatencyMs,
        max: maxLatencyMs,
        average: latencyCount > 0 ? totalLatencyMs / latencyCount : null,
      },
      emotion: {
        truePositives: emotionTruePositives,
        falsePositives: emotionFalsePositives,
        falseNegatives: emotionFalseNegatives,
        precision: emotionSummary.precision,
        recall: emotionSummary.recall,
        f1: emotionSummary.f1,
      },
    },
    samples: perSample,
    failures: failuresByReason,
  };

  const jsonPath = path.join(reportDir, `${timestamp}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2), 'utf8');

  const header = [
    'id',
    'text',
    'type',
    'subtype',
    'typeTag',
    'expectedTypeTag',
    'missingTypeTag',
    'topics',
    'expectedTopics',
    'topicCount',
    'emotions',
    'expectedEmotions',
    'emotionTP',
    'emotionFP',
    'emotionFN',
    'emotionPrecision',
    'emotionRecall',
    'personTags',
    'peopleFalsePositive',
    'latencyMs',
    'error',
  ];

  const rows: string[][] = [header];

  for (const sample of perSample) {
    const type = sample.output?.type ?? '';
    const subtype = sample.output && sample.output.type === 'note' ? sample.output.subtype : '';

    const latency = sample.metrics.latencyMs;
    rows.push([
      csvEscape(sample.id),
      csvEscape(sample.text),
      csvEscape(type),
      csvEscape(subtype),
      csvEscape(sample.typeTag ?? ''),
      csvEscape(sample.expected.normalizedTypeTag ?? ''),
      csvEscape(sample.metrics.missingTypeTag),
      csvEscape(sample.topicTags.join('; ')),
      csvEscape(sample.expected.normalizedTopics.join('; ')),
      csvEscape(sample.metrics.topicCount),
      csvEscape(sample.emotionTags.join('; ')),
      csvEscape(sample.expected.normalizedEmotions.join('; ')),
      csvEscape(sample.metrics.emotion.truePositives),
      csvEscape(sample.metrics.emotion.falsePositives),
      csvEscape(sample.metrics.emotion.falseNegatives),
      csvEscape(sample.metrics.emotion.precision ?? ''),
      csvEscape(sample.metrics.emotion.recall ?? ''),
      csvEscape(sample.personTags.join('; ')),
      csvEscape(sample.peopleFalsePositive),
      csvEscape(latency ?? ''),
      csvEscape(sample.error ?? ''),
    ]);
  }

  const csvPath = path.join(reportDir, `${timestamp}.csv`);
  const csvBuffer = rows.map((row) => row.join(',')).join('\n');
  await fs.writeFile(csvPath, `${csvBuffer}\n`, 'utf8');

  console.log('[tags-eval] Wrote evaluation report:', {
    jsonPath,
    csvPath,
    totalSamples: samples.length,
  });
}

void main().catch((error) => {
  console.error('[tags-eval] Evaluation failed:', error);
  process.exitCode = 1;
});
