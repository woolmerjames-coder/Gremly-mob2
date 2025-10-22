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
}
