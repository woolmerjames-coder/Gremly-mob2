import React, { createContext, useContext, useMemo } from 'react';
import type { ICortexEngine } from '../cortex/ICortexEngine';
import { createCortexEngine } from '../cortex/createEngine';
import { cortexDecide } from '../lib/cortex/cortexDecide';
import type { CortexContext, DecideInput, CortexResponse } from '../lib/cortex/cortexDecide';
import { useRepo } from './RepoProvider';

const defaultEngine = createCortexEngine();
const CortexCtx = createContext<ICortexEngine>(defaultEngine);

export const CortexProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const value = useMemo(() => createCortexEngine(), []);
  return <CortexCtx.Provider value={value}>{children}</CortexCtx.Provider>;
};

/**
 * Hook to access Cortex SDK
 *
 * Provides:
 * - cortexDecide: Raw SDK function (no context enrichment)
 * - decideWithContext: Enhanced SDK with space defaults and user prefs (Phase 10.4)
 * - classify: Legacy engine method (backward compatibility)
 *
 * @example
 * // With context enrichment (Phase 10.4):
 * const { decideWithContext } = useCortex();
 * const result = await decideWithContext(
 *   { text: "buy milk" },
 *   { userId: user.id, activeSpaceId: 'space-123', uiSurface: "chat" }
 * );
 *
 * // Raw SDK (Phase 10.1):
 * const { cortexDecide } = useCortex();
 * const result = await cortexDecide(
 *   { text: "buy milk" },
 *   { userId: user.id, activeSpaceId: null, uiSurface: "overlay" }
 * );
 *
 * // Legacy (backward compatibility):
 * const { classify } = useCortex();
 * const output = await classify({ text: "buy milk", spaceId: null });
 */
export const useCortex = () => {
  const engine = useContext(CortexCtx);
  const repo = useRepo();

  /**
   * Phase 10.4: Resolve decision context with space defaults and user tone prefs
   * Enriches base context with:
   * - spaceDefaults from spaces.defaults_json (if activeSpaceId present)
   * - userPrefsTone from cortex_preferences.tone (if userId present)
   */
  const resolveDecisionContext = async (ctx: CortexContext): Promise<CortexContext> => {
    const enriched = { ...ctx };

    try {
      // Fetch space defaults if activeSpaceId is present
      if (ctx.activeSpaceId) {
        const spaceDefaults = await repo.getSpaceDefaults(ctx.activeSpaceId);
        enriched.spaceDefaults = spaceDefaults;
      }

      // Fetch user tone preference from cortex_preferences
      if (ctx.userId) {
        const prefs = await repo.getCortexPrefs(ctx.userId);
        if (prefs?.tone) {
          enriched.userPrefsTone = prefs.tone as 'calm' | 'warm' | 'direct';
        }
      }
    } catch (error) {
      // Non-blocking - log error but continue with base context
      if (__DEV__) {
        console.warn('[CortexProvider] Failed to enrich context:', error);
      }
    }

    return enriched;
  };

  /**
   * Phase 10.4: Enhanced cortexDecide with automatic context enrichment
   * Fetches space defaults and user preferences before delegating to cortexDecide
   */
  const decideWithContext = async (
    input: DecideInput,
    ctx: CortexContext,
  ): Promise<CortexResponse> => {
    const enriched = await resolveDecisionContext(ctx);
    return cortexDecide(input, enriched);
  };

  return {
    // Phase 10.4: Enhanced SDK with context enrichment
    decideWithContext,
    resolveDecisionContext,

    // Phase 10.1: Raw SDK (no enrichment)
    cortexDecide,

    // Legacy interface (backward compatibility)
    classify: engine.classify.bind(engine),
  };
};
