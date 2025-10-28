/**
 * Catch-All Notepad integration smoke tests
 *
 * These assertions exercise the source file directly to make sure
 * the Mind Drop screen keeps calling into the Cortex engine in the way
 * our runtime expects. They intentionally avoid rendering to keep the
 * signal high and execution time low.
 */

describe('Catch-All + Cortex Integration', () => {
  const loadSource = () => {
    const fs = require('fs');
    const path = require('path');
    const catchAllPath = path.join(__dirname, '../app/screens/CatchAllNotepad.tsx');
    return fs.readFileSync(catchAllPath, 'utf-8');
  };

  it('should invoke the Cortex engine classify path', () => {
    const catchAllSource = loadSource();

    expect(catchAllSource).toContain(
      "import { createCortexEngine } from '../../cortex/createEngine'",
    );
    expect(catchAllSource).toContain('const engine = createCortexEngine()');
    expect(catchAllSource).toContain('.classify({ text: trimmed, spaceId: null })');
  });

  it('should map classification types to repo payloads', () => {
    const catchAllSource = loadSource();

    expect(catchAllSource).toContain("classifyOut?.type === 'todo'");
    expect(catchAllSource).toContain("classifyOut?.type === 'habit'");
    expect(catchAllSource).toContain("subtype: 'catchall'");
  });

  it('should log Catch-All decisions with intent metadata', () => {
    const catchAllSource = loadSource();

    expect(catchAllSource).toContain('logCatchallDecision');
    expect(catchAllSource).toContain('probableIntent');
    expect(catchAllSource).toContain('mode: decisionMode');
  });

  it('should set ai_placed flags based on payload type', () => {
    const catchAllSource = loadSource();

    expect(catchAllSource).toContain('ai_placed: true');
    expect(catchAllSource).toMatch(/ai_placed:\s*classifyOut\?\./);
  });

  it('should record trace checkpoints around classify and payload', () => {
    const catchAllSource = loadSource();

    expect(catchAllSource).toContain("step(trace, 'classify:start'");
    expect(catchAllSource).toContain("step(trace, 'classify:result'");
    expect(catchAllSource).toContain("step(trace, 'payload:final'");
  });
});
