export type SurfaceKey =
  | 'Hub:Catch-All'
  | 'Hub:Notes'
  | 'Hub:To-Dos'
  | 'Hub:Journal'
  | `Space:${string}`;

export function matchesSurface(_item: unknown, _key: SurfaceKey): boolean {
  // Phase 7: OFF. Will wire in Phase 10.
  return false;
}
