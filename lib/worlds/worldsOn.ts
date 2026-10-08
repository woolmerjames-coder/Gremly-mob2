/**
 * Whether this person has the Worlds tab, for code that cannot read the
 * store: chat's calls to the worker send it as worldsCard, so Gremly is told
 * their Worlds and Chapters, and can change them on a card, only for someone
 * who can see them (Worlds rebuild, stage 2). While the tab is for testers
 * (navigation/TabNavigator.tsx), this follows isTester. The store keeps it in
 * step (lib/store/useGremlyStore.ts followWorldsOn).
 */
let on = false;

export function worldsOn(): boolean {
  return on;
}

export function setWorldsOn(next: unknown): void {
  on = next === true;
}
