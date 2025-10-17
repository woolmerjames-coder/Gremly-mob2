# Catch-All Submit Pipeline - Visual Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     USER INTERACTION                                │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                   User types in CatchAllForm
                   Presses "Capture" button
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CatchAllForm.tsx - handleSubmit()                                  │
│  [CATCHALL][CAPTURE] submit dispatched, text: "..."                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                     Validates with Zod schema
                     Calls onSubmit({ type: 'catchall', data })
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ManualAddSheet.tsx - handleSubmit() - catchall branch              │
│  [CATCHALL][PIPE] start. classifyFlag: <bool>                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                         Validate trimmedBody
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │ classifyFlag === true?  │
                    └─────────────────────────┘
                            │         │
                          YES        NO
                            │         │
                            ▼         ▼
                    ┌──────────┐  ┌──────────────────┐
                    │ CLASSIFY │  │ SKIP (res = null)│
                    └──────────┘  └──────────────────┘
                            │              │
      [CATCHALL][PIPE]      │              │
      invoking cortex...    │              │
                            ▼              │
                    ┌────────────────┐    │
                    │ cortex.classify│    │
                    │  (via provider)│    │
                    └────────────────┘    │
                            │              │
                     ┌──────┴──────┐      │
                     │   SUCCESS   │      │
                     ▼             ▼      │
              ┌──────────┐  ┌──────────┐ │
              │ res!=null│  │ ERROR    │ │
              └──────────┘  │ res=null │ │
                     │      └──────────┘ │
                     └──────────┬────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  MAP TO REPO PAYLOAD (Single Source of Truth)                       │
│                                                                      │
│  res ? mapClassificationToCreateInput(res, body, spaceId)           │
│      : { type:'note', subtype:'catchall', ai_placed:false, ... }    │
│                                                                      │
│  [CATCHALL][PIPE] final payload: { type, subtype, ai_placed, ... }  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  repo.create(payload)                                                │
│  → MemoryRepo or SupabaseRepo                                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                          ┌──────────────┐
                          │ SUCCESS ✅   │
                          │ Animation    │
                          │ Close sheet  │
                          └──────────────┘
```

## Cortex Engine Selection Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  CortexProvider (mount time)                                         │
│  → createCortexEngine()                                              │
│     [createCortexEngine] choose: { engineFlag, hasKey, ... }         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
              ┌───────────────────────────────────┐
              │ EXPO_PUBLIC_CORTEX_CLASSIFY_      │
              │ CATCHALL === 'true' ?             │
              └───────────────────────────────────┘
                        │              │
                       NO             YES
                        │              │
                        ▼              ▼
            ┌──────────────────┐  ┌──────────────────┐
            │ DisabledEngine   │  │ Check engine type│
            │ (always catchall)│  └──────────────────┘
            └──────────────────┘          │
                                          │
                        ┌─────────────────┴─────────────────┐
                        │                                   │
                  engineFlag='LLM'              engineFlag='HEURISTIC'
                  hasKey=true                   OR hasKey=false
                        │                                   │
                        ▼                                   ▼
        ┌────────────────────────────┐        ┌────────────────────┐
        │ ManagedCortexEngine        │        │ HeuristicEngine    │
        │  - primary: OpenAIEngine   │        │ (keyword-based)    │
        │  - fallback: HeuristicEngine│       └────────────────────┘
        │  - limiter: RateLimiter    │
        └────────────────────────────┘
                        │
                        ▼
            Per-request flow:
            1. Check rate limit
            2. Try OpenAI API
            3. On error → fallback to heuristic
```

## Environment Flag Decision Tree

```
                     ┌─────────────────────┐
                     │ Classification Run? │
                     └─────────────────────┘
                               │
        ┌──────────────────────┴──────────────────────┐
        │                                             │
  EXPO_PUBLIC_CORTEX_                          EXPO_PUBLIC_CORTEX_
  CLASSIFY_CATCHALL='false'                    CLASSIFY_CATCHALL='true'
        │                                             │
        ▼                                             ▼
  ┌──────────────┐                         ┌──────────────────┐
  │ SKIP CORTEX  │                         │ Which engine?    │
  │ Always return│                         └──────────────────┘
  │ default      │                                   │
  │ catch-all    │                    ┌──────────────┴──────────────┐
  └──────────────┘                    │                             │
                            EXPO_PUBLIC_CORTEX_          EXPO_PUBLIC_CORTEX_
                            ENGINE='LLM'                 ENGINE='HEURISTIC'
                            + hasKey=true                OR hasKey=false
                                    │                             │
                                    ▼                             ▼
                          ┌──────────────────┐        ┌──────────────────┐
                          │ OpenAI Engine    │        │ Heuristic Engine │
                          │ with fallback    │        │ (keyword-based)  │
                          │ + rate limiter   │        └──────────────────┘
                          └──────────────────┘
```

## Example Debug Log Sequence

### Successful Classification (LLM)
```
[createCortexEngine] choose: {
  engineFlag: 'LLM',
  classifyFlag: 'true',
  hasKey: true,
  model: 'gpt-4o-mini'
}
[createCortexEngine] using OpenAI engine with rate limiter

[CATCHALL][FORM] render, entry length: 0
[CATCHALL][FORM] render, entry length: 34
[CATCHALL][CAPTURE] submit dispatched, text: "Buy milk and eggs at the store toda..."
[CATCHALL][FORM] validation success, submitting payload
[CATCHALL][FORM] onSubmit dispatched

[CATCHALL][PIPE] start. classifyFlag: true, text length: 34
[CATCHALL][PIPE] invoking cortex.classify...
[OpenAIEngine] classify start, text length: 34
[OpenAIEngine] API response: { type: 'todo', undefinedDue: true, ... }
[CATCHALL][PIPE] engine result: {
  type: 'todo',
  undefinedDue: true,
  aiPlaced: true,
  whyString: 'Detected shopping task with actionable items.'
}
[CATCHALL][PIPE] final payload: {
  type: 'todo',
  ai_placed: true,
  why_string: 'Detected shopping task with actionable items.'
}
```

### Classification Disabled
```
[createCortexEngine] choose: {
  engineFlag: 'LLM',
  classifyFlag: 'false',
  hasKey: true,
  model: 'gpt-4o-mini'
}
[createCortexEngine] classification disabled by flag

[CATCHALL][CAPTURE] submit dispatched, text: "Random thought about the weekend"
[CATCHALL][PIPE] start. classifyFlag: false, text length: 35
[CATCHALL][PIPE] classification disabled by flag
[CATCHALL][PIPE] final payload: {
  type: 'note',
  subtype: 'catchall',
  ai_placed: false,
  why_string: null
}
```

### Classification Error (Fallback)
```
[CATCHALL][PIPE] start. classifyFlag: true, text length: 42
[CATCHALL][PIPE] invoking cortex.classify...
[OpenAIEngine] classify start, text length: 42
[OpenAIEngine] API error: timeout after 2500ms
[ManagedCortexEngine] Primary engine failed; falling back to heuristic.
[HeuristicEngine] classify input: "..."
[CATCHALL][PIPE] engine result: {
  type: 'note',
  subtype: 'catchall',
  aiPlaced: false,
  whyString: 'No strong signals detected.'
}
[CATCHALL][PIPE] final payload: {
  type: 'note',
  subtype: 'catchall',
  ai_placed: false,
  why_string: 'No strong signals detected.'
}
```

---

**Legend:**
- `[COMPONENT][STAGE]` = Debug log prefix
- `→` = Data/control flow
- `┌─┐` = Decision point
- `▼` = Sequential flow
- `✅` = Success state
