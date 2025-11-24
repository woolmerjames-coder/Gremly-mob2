#!/usr/bin/env tsx
/**
 * Mind Drop Log Analyzer
 *
 * Reads minddrop-test.log and extracts classification behavior for each Mind Drop entry.
 * Outputs structured JSON showing the full classification pipeline from rule matching
 * through AI classification to final entity creation.
 *
 * Usage:
 *   npm run analyze:drops
 *   npm run analyze:drops -- --json > results.json
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from 'fs';
import path from 'path';

interface MindDropEvent {
  dropId: string;
  text: string;
  timestamp?: string;

  // Intent detection
  ruleKind?: string;
  ruleName?: string;
  ruleConfidence?: number;

  // AI classification
  aiCategory?: string;
  aiConfidence?: number;
  aiRawResponse?: string;

  // Canonical intent
  canonicalType?: string;
  canonicalConfidence?: number;
  canonicalAllowAutoCreate?: boolean;
  canonicalSuppressChips?: boolean;
  canonicalReasoning?: string;

  // Final decision
  finalMode?: string;
  finalConfidence?: number;
  finalActions?: string[];

  // Entity creation
  entityId?: string;
  entityType?: string;
  initialTitle?: string;
  initialSubtype?: string;
  initialTags?: string[];

  // Background prefill
  aiTitle?: string | null;
  computedTitle?: string;
  finalTitle?: string;
  aiTags?: string[];
  finalTags?: string[];
  titleSet?: boolean;

  // Outcome
  outcome?: string;
  chipDisplayed?: boolean;
}

function extractLogValue(logLine: string, key: string): any {
  // Try to extract JSON object from log line
  const jsonMatch = logLine.match(/\{[^}]+\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      return obj[key];
    } catch {
      return undefined;
    }
  }

  // Try to extract quoted value
  const quotedMatch = logLine.match(new RegExp(`${key}[=:]\\s*"([^"]+)"`));
  if (quotedMatch) return quotedMatch[1];

  // Try to extract unquoted value
  const unquotedMatch = logLine.match(new RegExp(`${key}[=:]\\s*([^,}\\s]+)`));
  if (unquotedMatch) return unquotedMatch[1];

  return undefined;
}

function parseLogFile(logPath: string): MindDropEvent[] {
  if (!fs.existsSync(logPath)) {
    console.error(`❌ Log file not found: ${logPath}`);
    console.error('Run ./scripts/capture-logs.sh first to capture logs');
    process.exit(1);
  }

  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n');

  const events: Map<string, MindDropEvent> = new Map();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Extract TRACE submit (start of Mind Drop)
    if (line.includes('[TRACE]') && line.includes('submit')) {
      const dropIdMatch = line.match(/minddrop-[a-z0-9-]+/);
      if (dropIdMatch) {
        const dropId = dropIdMatch[0];

        if (!events.has(dropId)) {
          events.set(dropId, {
            dropId,
            text: '', // Will be filled from next log
          });
        }
      }
    }

    // Extract intent rules match
    if (line.includes('[intentRules] Matched rule:')) {
      const dropId = findRecentDropId(lines, i);
      if (dropId && events.has(dropId)) {
        const event = events.get(dropId)!;
        event.ruleKind = extractLogValue(line, 'kind');
        event.ruleName = extractLogValue(line, 'name');
        event.rulePriority = extractLogValue(line, 'priority');

        // Extract text snippet from rule match
        const textMatch = line.match(/"text":\s*"([^"]+)"/);
        if (textMatch && !event.text) {
          event.text = textMatch[1];
        }
      }
    }

    // Extract AI classification
    if (line.includes('[classifyIntentWithAI] AI raw response:')) {
      const dropId = findRecentDropId(lines, i);
      if (dropId && events.has(dropId)) {
        const event = events.get(dropId)!;
        const jsonMatch = line.match(/\{[^}]+\}/);
        if (jsonMatch) {
          try {
            const aiResponse = JSON.parse(jsonMatch[0]);
            event.aiCategory = aiResponse.category;
            event.aiConfidence = aiResponse.confidence;
            event.aiRawResponse = jsonMatch[0];
          } catch (err) {
            // Ignore parse errors
          }
        }
      }
    }

    // Extract canonical intent result
    if (line.includes('[CanonicalIntent]') && !line.includes('Chip decision')) {
      const dropId = findRecentDropId(lines, i);
      if (dropId && events.has(dropId)) {
        const event = events.get(dropId)!;

        // Look for the reasoning line
        if (line.includes('reasoning:')) {
          const reasoningMatch = line.match(/reasoning:\s*['"]([^'"]+)['"]/);
          if (reasoningMatch) {
            event.canonicalReasoning = reasoningMatch[1];
          }
        }

        // Extract canonical decision from JSON
        const jsonMatch = line.match(/\{[^}]+\}/);
        if (jsonMatch) {
          try {
            const canonical = JSON.parse(jsonMatch[0]);
            event.canonicalType = canonical.type;
            event.canonicalConfidence = canonical.confidence;
            event.canonicalAllowAutoCreate = canonical.allowAutoCreate;
            event.canonicalSuppressChips = canonical.suppressChips;
            if (canonical.reasoning) {
              event.canonicalReasoning = canonical.reasoning;
            }
          } catch (err) {
            // Ignore parse errors
          }
        }
      }
    }

    // Extract cortexDecide final decision
    if (line.includes('[cortexDecide][final]')) {
      const dropId = findRecentDropId(lines, i);
      if (dropId && events.has(dropId)) {
        const event = events.get(dropId)!;
        const jsonMatch = line.match(/\{[^}]+\}/);
        if (jsonMatch) {
          try {
            const decision = JSON.parse(jsonMatch[0]);
            event.finalMode = decision.mode;
            event.finalConfidence = decision.confidence;
            event.finalActions = decision.actions || [];
          } catch (err) {
            // Ignore parse errors
          }
        }
      }
    }

    // Extract entity creation (SupabaseRepo.create)
    if (line.includes('[SupabaseRepo.create] Raw result from DB:')) {
      const dropId = findRecentDropId(lines, i);
      if (dropId && events.has(dropId)) {
        // Parse multi-line JSON object
        const entityJson = extractMultiLineJson(lines, i);
        if (entityJson) {
          const event = events.get(dropId)!;
          event.entityId = entityJson.id;
          event.entityType = 'note'; // Default, could be todo/habit
          event.initialTitle = entityJson.title;
          event.initialSubtype = entityJson.subtype;
          event.initialTags = Array.isArray(entityJson.tags) ? entityJson.tags : [];

          // Extract full text from body
          if (entityJson.body && !event.text) {
            event.text = entityJson.body;
          }
        }
      }
    }

    // Extract BackgroundPrefill results
    if (line.includes('[BackgroundPrefill] Note title comparison')) {
      const entityIdMatch = line.match(/"entityId":\s*"([^"]+)"/);
      if (entityIdMatch) {
        const entityId = entityIdMatch[1];
        const event = findEventByEntityId(events, entityId);
        if (event) {
          const jsonMatch = line.match(/\{[^}]+\}/);
          if (jsonMatch) {
            try {
              const titleData = JSON.parse(jsonMatch[0]);
              event.aiTitle = titleData.aiTitle;
              event.computedTitle = titleData.computedTitle;
            } catch (err) {
              // Ignore parse errors
            }
          }
        }
      }
    }

    if (line.includes('[BackgroundPrefill] Save success')) {
      const entityIdMatch = line.match(/"entityId":\s*"([^"]+)"/);
      if (entityIdMatch) {
        const entityId = entityIdMatch[1];
        const event = findEventByEntityId(events, entityId);
        if (event) {
          const jsonMatch = line.match(/\{[^}]+\}/);
          if (jsonMatch) {
            try {
              const saveData = JSON.parse(jsonMatch[0]);
              event.finalTitle = saveData.title;
              event.titleSet = saveData.titleSet;
              event.finalTags = saveData.tagsCount > 0 ? [] : []; // Tags in separate log
            } catch (err) {
              // Ignore parse errors
            }
          }
        }
      }
    }

    if (line.includes('[BackgroundPrefill] Title saved')) {
      const entityIdMatch = line.match(/"entityId":\s*"([^"]+)"/);
      if (entityIdMatch) {
        const entityId = entityIdMatch[1];
        const event = findEventByEntityId(events, entityId);
        if (event) {
          const titleMatch = line.match(/"title":\s*"([^"]+)"/);
          if (titleMatch) {
            event.finalTitle = titleMatch[1];
          }
        }
      }
    }

    // Extract outcome from TRACE END
    if (line.includes('[TRACE][END]')) {
      const dropIdMatch = line.match(/minddrop-[a-z0-9-]+/);
      if (dropIdMatch) {
        const dropId = dropIdMatch[0];
        if (events.has(dropId)) {
          const event = events.get(dropId)!;
          const outcomeMatch = line.match(/"outcome":\s*"([^"]+)"/);
          if (outcomeMatch) {
            event.outcome = outcomeMatch[1];
          }
        }
      }
    }

    // Detect chip display
    if (line.includes('narrative:forced-category-chips')) {
      const dropId = findRecentDropId(lines, i);
      if (dropId && events.has(dropId)) {
        events.get(dropId)!.chipDisplayed = true;
      }
    }
  }

  return Array.from(events.values()).filter((e) => e.text); // Only events with text
}

function findRecentDropId(lines: string[], currentIndex: number): string | null {
  // Look backwards for the most recent dropId
  for (let i = currentIndex; i >= Math.max(0, currentIndex - 50); i--) {
    const match = lines[i].match(/minddrop-[a-z0-9-]+/);
    if (match) return match[0];
  }
  return null;
}

function findEventByEntityId(
  events: Map<string, MindDropEvent>,
  entityId: string,
): MindDropEvent | null {
  for (const event of events.values()) {
    if (event.entityId === entityId) {
      return event;
    }
  }
  return null;
}

function extractMultiLineJson(lines: string[], startIndex: number): any {
  // Find the start of JSON object
  let jsonStart = startIndex;
  for (let i = startIndex; i < Math.min(lines.length, startIndex + 5); i++) {
    if (lines[i].includes('{')) {
      jsonStart = i;
      break;
    }
  }

  // Collect lines until we find the closing brace
  const jsonLines: string[] = [];
  let braceCount = 0;

  for (let i = jsonStart; i < Math.min(lines.length, jsonStart + 100); i++) {
    const line = lines[i];
    jsonLines.push(line);

    // Count braces
    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }

    if (braceCount === 0 && jsonLines.length > 1) {
      break;
    }
  }

  // Try to parse the collected JSON
  const jsonStr = jsonLines.join('\n').replace(/^[^{]*/, ''); // Remove log prefix
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function formatEvent(event: MindDropEvent): any {
  return {
    dropId: event.dropId,
    text: event.text,

    // Intent detection
    ruleKind: event.ruleKind,
    ruleName: event.ruleName,

    // AI classification
    aiCategory: event.aiCategory,
    aiConfidence: event.aiConfidence,

    // Canonical intent
    canonicalCategory: event.canonicalType,
    canonicalConfidence: event.canonicalConfidence,
    canonicalAllowAutoCreate: event.canonicalAllowAutoCreate,
    canonicalReasoning: event.canonicalReasoning,

    // Final decision
    finalMode: event.finalMode,
    finalCategory: event.finalActions?.[0]?.replace('create.', ''),
    finalConfidence: event.finalConfidence,

    // Titles
    initialTitle: event.initialTitle,
    aiTitle: event.aiTitle,
    computedTitle: event.computedTitle,
    finalTitle: event.finalTitle,
    titleSet: event.titleSet,

    // Tags
    initialTags: event.initialTags || [],
    aiTags: event.aiTags || [],
    finalTags: event.finalTags || [],

    // Outcome
    outcome: event.outcome,
    chipDisplayed: event.chipDisplayed || false,
  };
}

function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');

  const logPath = path.join(process.cwd(), 'minddrop-test.log');

  if (!jsonOutput) {
    console.log('🔍 Analyzing Mind Drop logs...\n');
  }

  const events = parseLogFile(logPath);

  if (events.length === 0) {
    console.error('❌ No Mind Drop events found in log file');
    console.error('Make sure you:');
    console.error('  1. Ran ./scripts/capture-logs.sh');
    console.error('  2. Performed some Mind Drop entries');
    console.error('  3. Stopped the capture (Ctrl+C)');
    process.exit(1);
  }

  const formatted = events.map(formatEvent);

  if (jsonOutput) {
    console.log(JSON.stringify(formatted, null, 2));
  } else {
    console.log(`📊 Found ${events.length} Mind Drop event(s)\n`);
    console.log('='.repeat(80));

    formatted.forEach((event, index) => {
      console.log(`\n[${index + 1}/${formatted.length}] Drop: ${event.dropId}`);
      console.log(`Text: "${event.text}"`);
      console.log('');
      console.log('🎯 Classification:');
      console.log(`  Rule:       ${event.ruleName || 'unknown'} (${event.ruleKind})`);
      console.log(`  AI:         ${event.aiCategory} (confidence: ${event.aiConfidence})`);
      console.log(
        `  Canonical:  ${event.canonicalCategory} (confidence: ${event.canonicalConfidence?.toFixed(2)})`,
      );
      console.log(`  Final:      ${event.finalCategory} (mode: ${event.finalMode})`);
      console.log('');
      console.log('📝 Titles:');
      console.log(`  Initial:    "${event.initialTitle}"`);
      console.log(`  AI:         ${event.aiTitle === null ? 'null' : `"${event.aiTitle}"`}`);
      console.log(`  Computed:   "${event.computedTitle}"`);
      console.log(`  Final:      "${event.finalTitle}" (saved: ${event.titleSet})`);
      console.log('');
      console.log('🏷️  Tags:');
      console.log(`  Initial:    ${JSON.stringify(event.initialTags)}`);
      console.log(`  Final:      ${JSON.stringify(event.finalTags)}`);
      console.log('');
      console.log('📊 Outcome:');
      console.log(`  Mode:       ${event.outcome}`);
      console.log(`  Chips:      ${event.chipDisplayed ? 'YES ⚠️' : 'NO ✓'}`);
      if (event.canonicalReasoning) {
        console.log(`  Reasoning:  ${event.canonicalReasoning}`);
      }
      console.log('='.repeat(80));
    });

    // Summary statistics
    console.log('\n📈 Summary Statistics:\n');
    const stats = {
      total: formatted.length,
      byCanonical: {} as Record<string, number>,
      byOutcome: {} as Record<string, number>,
      chipsShown: formatted.filter((e) => e.chipDisplayed).length,
      titlesSaved: formatted.filter((e) => e.titleSet).length,
    };

    formatted.forEach((e) => {
      const canonical = e.canonicalCategory || 'unknown';
      stats.byCanonical[canonical] = (stats.byCanonical[canonical] || 0) + 1;

      const outcome = e.outcome || 'unknown';
      stats.byOutcome[outcome] = (stats.byOutcome[outcome] || 0) + 1;
    });

    console.log(`Total drops: ${stats.total}`);
    console.log(`\nBy canonical category:`);
    Object.entries(stats.byCanonical).forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}`);
    });
    console.log(`\nBy outcome:`);
    Object.entries(stats.byOutcome).forEach(([out, count]) => {
      console.log(`  ${out}: ${count}`);
    });
    console.log(`\nChips displayed: ${stats.chipsShown}/${stats.total}`);
    console.log(`Titles saved: ${stats.titlesSaved}/${stats.total}`);

    console.log('\n💡 Tip: Run with --json flag to get machine-readable output');
    console.log('   npm run analyze:drops -- --json > results.json');
  }
}

main();
