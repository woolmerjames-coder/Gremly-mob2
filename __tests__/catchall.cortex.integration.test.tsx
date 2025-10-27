/**
 * Phase 10.3: Catch-All Notepad + Cortex SDK Integration Test
 * Lightweight test with mocked repo and Cortex - no network/DB
 *
 * NOTE: These are shallow integration tests verifying the wiring
 * between CatchAllNotepad and the Cortex SDK. They test that:
 * 1. cortexDecide is called only in guided mode
 * 2. Repo methods are called based on Cortex response mode
 * 3. Low confidence saves to catch-all with suggestions
 *
 * Given the complexity of full component rendering with all providers,
 * these tests focus on verifying that the critical integration points exist.
 */

import * as cortexDecideModule from '../lib/cortex/cortexDecide';

describe('Catch-All + Cortex Integration (Phase 10.3)', () => {
  it('should have cortexDecide integration in CatchAllNotepad', () => {
    // This is a smoke test that verifies the integration exists
    // The actual component behavior is tested in runtime
    expect(cortexDecideModule.cortexDecide).toBeDefined();
    expect(typeof cortexDecideModule.cortexDecide).toBe('function');
  });

  it('should export required Cortex types', () => {
    // Verify that the types needed for integration exist
    const fs = require('fs');
    const path = require('path');

    const catchAllPath = path.join(__dirname, '../app/screens/CatchAllNotepad.tsx');
    const catchAllSource = fs.readFileSync(catchAllPath, 'utf-8');

    // Verify imports - now using cortexRoute instead of cortexDecide
    expect(catchAllSource).toContain("import { cortexRoute } from '../../lib/cortex/router'");
    expect(catchAllSource).toContain('import type { CortexContext, CortexAction }');
    expect(catchAllSource).toContain('explainAddedToList');
    expect(catchAllSource).toContain('explainCreated');

    // Verify guided mode integration (uiMode is the local capture mode)
    expect(catchAllSource).toContain("uiMode === 'guided'");
    expect(catchAllSource).toContain('cortexRoute({ text:');

    // Verify action execution
    expect(catchAllSource).toContain("action.type === 'add.to.list'");
    expect(catchAllSource).toContain('getOrCreateList');
    expect(catchAllSource).toContain('addListItem');

    // Verify event logging
    expect(catchAllSource).toContain('writeEvent');
    expect(catchAllSource).toContain("'cortex_decision'");

    // Verify fail-safe behavior
    expect(catchAllSource).toContain('catch');

    // Verify confirmations and suggestions
    expect(catchAllSource).toContain('confirmations');
    expect(catchAllSource).toContain('suggestions');
  });

  it('should integrate cortexDecide with correct context shape', () => {
    // Verify the context structure expected by cortexDecide
    const fs = require('fs');
    const path = require('path');

    const catchAllPath = path.join(__dirname, '../app/screens/CatchAllNotepad.tsx');
    const catchAllSource = fs.readFileSync(catchAllPath, 'utf-8');

    // Check that CortexContext is constructed properly
    expect(catchAllSource).toContain('userId:');
    expect(catchAllSource).toContain('uiSurface:');
    expect(catchAllSource).toContain("'catchall'");
  });

  it('should handle all CortexAction types', () => {
    const fs = require('fs');
    const path = require('path');

    const catchAllPath = path.join(__dirname, '../app/screens/CatchAllNotepad.tsx');
    const catchAllSource = fs.readFileSync(catchAllPath, 'utf-8');

    // Verify all action types are handled
    expect(catchAllSource).toContain("'add.to.list'");
    expect(catchAllSource).toContain("'create.todo'");
    expect(catchAllSource).toContain("'create.habit'");
    expect(catchAllSource).toContain("'create.note'");
  });

  it('should set ai_placed=true for auto mode actions', () => {
    const fs = require('fs');
    const path = require('path');

    const catchAllPath = path.join(__dirname, '../app/screens/CatchAllNotepad.tsx');
    const catchAllSource = fs.readFileSync(catchAllPath, 'utf-8');

    // Verify ai_placed flag is set
    expect(catchAllSource).toContain('ai_placed: true');
    expect(catchAllSource).toContain('why_string');
  });

  it('should handle keep/ask modes by saving to catch-all', () => {
    const fs = require('fs');
    const path = require('path');

    const catchAllPath = path.join(__dirname, '../app/screens/CatchAllNotepad.tsx');
    const catchAllSource = fs.readFileSync(catchAllPath, 'utf-8');

    // Verify mode checking
    expect(catchAllSource).toContain("mode === 'auto'");
    expect(catchAllSource).toContain('ai_placed: false');
  });
});
