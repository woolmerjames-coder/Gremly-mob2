/** Types for factTiming.js, for TypeScript callers (data fabric stage 5). */
type Fact = Record<string, unknown>;
export const FACT_TIMINGS: string[];
export function validTiming(timing: unknown): string | null;
export const TIMING_RULES: string;
export function nextYearly(date: string, from: string): string;
export function dayOn(fact: Fact, today?: string | null): string | null;
export function asOfToday<T extends Fact>(fact: T, today: string): T & { every_year?: boolean };
export function whenTrue(fact: Fact, from?: string | null): string;
export function factTiming(fact: Fact, today: string): unknown;
export function planPassed(fact: Fact, today: string): boolean;
export function stateWords(fact: Fact, today: string): string;
