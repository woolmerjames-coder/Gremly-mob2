// lib/cortex/lane.ts
export type Lane = 'catchall' | 'space_chat' | 'system';

export interface CortexContextBase {
  lane?: Lane; // Optional with default 'system' for backward compatibility
  // keep space for future fields we already pass around elsewhere
  spaceId?: string | null;
  messageId?: string | null;
  userId?: string | null;
  /** Track the kind of the last assistant message for anti-spam logic */
  recentAssistantKind?: 'smalltalk' | 'decision' | 'classification' | null;
  /** Phase 10.7B: Track recent intents to detect reiteration */
  recentIntentBuffer?: Array<{ kind: string; turn: number }>;
  /** Phase 10.7B: Turn counter for cooldown logic */
  currentTurn?: number;
  /** Phase 10.7B: Last turn that showed a chip */
  lastChipTurn?: number;
  /** Phase 10.7C: Track which topics have been clarified (curiosity phase) */
  clarifiedTopics?: Set<string>;
}
