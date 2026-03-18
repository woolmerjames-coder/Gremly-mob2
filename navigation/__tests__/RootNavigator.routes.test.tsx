/**
 * Type-level contract tests for RootStackParamList.
 *
 * These tests verify that the navigation type definitions
 * include the expected routes with correct param shapes,
 * especially the new WeeklySummaryV2 route added on this branch.
 */

import type { RootStackParamList } from '../RootNavigator';

// ── Compile-time assertions via type-level assignments ─────────────────────

// WeeklySummaryV2 exists and accepts optional weekStartDate
type WSV2Params = RootStackParamList['WeeklySummaryV2'];
const _v2Undefined: WSV2Params = undefined;
const _v2WithDate: WSV2Params = { weekStartDate: '2025-12-15' };
const _v2Empty: WSV2Params = {};

// WeeklySummary (V1) still exists for backward compat
type WSV1Params = RootStackParamList['WeeklySummary'];
const _v1Undefined: WSV1Params = undefined;
const _v1WithDate: WSV1Params = { weekStartDate: '2025-12-15' };

// MorningBrief accepts optional targetDate
type MBParams = RootStackParamList['MorningBrief'];
const _mbUndefined: MBParams = undefined;
const _mbWithDate: MBParams = { targetDate: '2025-12-15' };

// Suppress unused variable warnings
void _v2Undefined;
void _v2WithDate;
void _v2Empty;
void _v1Undefined;
void _v1WithDate;
void _mbUndefined;
void _mbWithDate;

// ── Runtime tests ─────────────────────────────────────────────────────────────

describe('RootStackParamList route types', () => {
  // We test at runtime by instantiating objects that match the expected types.
  // If the type definition changes incompatibly, TypeScript will fail compilation
  // before these tests even run.

  it('WeeklySummaryV2 accepts undefined params', () => {
    const params: RootStackParamList['WeeklySummaryV2'] = undefined;
    expect(params).toBeUndefined();
  });

  it('WeeklySummaryV2 accepts weekStartDate string', () => {
    const params: RootStackParamList['WeeklySummaryV2'] = { weekStartDate: '2025-12-15' };
    expect(params?.weekStartDate).toBe('2025-12-15');
  });

  it('WeeklySummary (V1) still exists in param list', () => {
    const params: RootStackParamList['WeeklySummary'] = { weekStartDate: '2025-12-15' };
    expect(params?.weekStartDate).toBe('2025-12-15');
  });

  it('all expected routes exist in the type', () => {
    // This is a compile-time check — if any of these keys
    // don't exist in RootStackParamList, TypeScript will error.
    type AssertRouteExists<K extends keyof RootStackParamList> = K;

    type _Login = AssertRouteExists<'Login'>;
    type _Tabs = AssertRouteExists<'Tabs'>;
    type _CatchAllNotepad = AssertRouteExists<'CatchAllNotepad'>;
    type _SpaceDetail = AssertRouteExists<'SpaceDetail'>;
    type _ChatThread = AssertRouteExists<'ChatThread'>;
    type _WeeklySummary = AssertRouteExists<'WeeklySummary'>;
    type _WeeklySummaryV2 = AssertRouteExists<'WeeklySummaryV2'>;
    type _MorningBrief = AssertRouteExists<'MorningBrief'>;
    type _CalendarScreen = AssertRouteExists<'CalendarScreen'>;
    type _Habits = AssertRouteExists<'Habits'>;
    type _HabitDetail = AssertRouteExists<'HabitDetail'>;
    type _Settings = AssertRouteExists<'Settings'>;

    // If we reach here, all routes compile
    expect(true).toBe(true);
  });

  it('ChatThread requires spaceId', () => {
    const params: RootStackParamList['ChatThread'] = { spaceId: 'space-abc' };
    expect(params.spaceId).toBe('space-abc');
  });

  it('SpaceDetail requires id', () => {
    const params: RootStackParamList['SpaceDetail'] = { id: 'space-123' };
    expect(params.id).toBe('space-123');
  });

  it('HabitDetail requires habitId', () => {
    const params: RootStackParamList['HabitDetail'] = { habitId: 'h-1' };
    expect(params.habitId).toBe('h-1');
  });
});
