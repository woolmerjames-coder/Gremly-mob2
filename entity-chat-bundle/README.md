# Entity Chat Bundle

This bundle contains all files related to Entity Chat for analysis and improvement.

## 1. Core Entity Chat Logic

| File | Description |
|------|-------------|
| `index.js` | Cloudflare Worker - Entity chat cortex endpoint (`/entity-chat`), includes the entity chat system prompt (line ~1059) |
| `CortexClient.ts` | Client-side service that calls the API, handles SSE streaming |
| `EntityChatScreen.tsx` | UI component - renders chat, handles save cards, save functionality |
| `ChatBubble.tsx` | Chat message rendering component, displays sources/images |

## 2. Context Sources (to embed more)

| File | Description |
|------|-------------|
| `types.ts` | Entity type definitions - Todo, Habit, Note, EntityChatMessage, etc. |
| `BRAND_VOICE_IMPLEMENTATION.md` | Gremly brand/tone guidelines |
| `BRAND_REFRESH_SUMMARY.md` | Brand refresh summary |
| `README.md` | Project README with product philosophy |

## 3. Related for Consistency

| File | Description |
|------|-------------|
| `gremlyPersona.ts` | Space chat system prompt builder - has better tone to compare |
| `useSpaceChatEnhanced.ts` | Space chat hook - shows how context is built for Spaces |
| `classifyIntentWithAI.ts` | Mind Drop classification prompt - good language to borrow |
| `classifyLogSubtype.ts` | Log subtype classification prompt |

## Key Locations in Worker (index.js)

- **Entity Chat System Prompt**: Line ~1059 - `const entityChatSystemPrompt = ...`
- **Entity Chat Endpoint**: Line ~1000 - `if (pathname === '/entity-chat' && method === 'POST')`
- **Mind Drop Classification**: Line ~3180 - `const reclassifyPrompt = ...`
- **Phase 1 Classification**: Line ~2600-2800 - Main classification logic

## Key Locations in EntityChatScreen.tsx

- **Save Note Handler**: Line ~650 - `handleSaveNote`
- **Render Message**: Line ~765 - `renderMessage` useCallback
- **isAlreadySaved Logic**: Line ~789 - saved state determination

## Entity Chat Request/Response Shape

```typescript
// Request (from CortexClient.ts)
{
  message: string;
  entity_type: 'todo' | 'habit' | 'note';
  entity_id: string;
  entity_name: string;
  entity_body?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  preset?: string;
  user_timezone?: string;
}

// Response (SSE stream)
{
  content: string;
  saveable?: { detected: boolean; type?: string };
  save_suggestion?: { type: 'todo' | 'habit' | 'note'; title: string; steps?: string[] };
  sources?: Array<{ title: string; url: string }>;
  images?: string[];
}
```
