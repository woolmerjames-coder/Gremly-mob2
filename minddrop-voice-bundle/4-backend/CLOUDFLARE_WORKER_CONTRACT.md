# Cloudflare Worker Contract

This document defines the expected response formats for the Cloudflare Worker that Space Chat communicates with.

## Response Formats

The worker should return one of the following response shapes:

### 1. Chat Shape (OpenAI Compatible)

For maximum compatibility with existing OpenAI-based tools:

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "<response text>"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  },
  "model": "gpt-4o-mini",
  "id": "chatcmpl-..."
}
```

### 2. Compact Shape (Current Implementation)

For simpler responses when choices array is not needed:

```json
{
  "content": "<response text>",
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  },
  "model": "gpt-4o-mini",
  "id": "cmpl-...",
  "hasChoices": false
}
```

**Required fields for compact shape:**
- `content` (string): The response text from the model
- `hasChoices` (boolean): Must be `false` to indicate compact format
- `model` (string): Model identifier
- `id` (string): Unique response identifier

**Optional fields:**
- `usage` (object): Token usage statistics

## Future Extensions

### Intent Suggestions (Optional)

When implementing intent detection, include:

```json
{
  "content": "<response text>",
  "suggestions": [
    {
      "kind": "todo" | "note" | "habit",
      "why": "Brief explanation",
      "title": "Suggested action title"
    }
  ],
  "hasChoices": false,
  "model": "gpt-4o-mini",
  "id": "cmpl-..."
}
```

## Error Handling

For errors, return HTTP 4xx/5xx with:

```json
{
  "error": "Error description",
  "detail": "Additional error context (optional)"
}
```

## Client Handling

The Space Chat client includes defensive mapping:

1. **Standard Flow**: OpenAI engine expects `choices` array format
2. **Fallback Flow**: When OpenAI engine fails, conversation pipeline tries direct worker call
3. **Compact Format**: Maps `{ content: "text", hasChoices: false }` to `{ mode: "reply", replyText: "text" }`
4. **Error Recovery**: Falls back to safe "Saving to Catch-All" response

This ensures Space Chat works regardless of worker response format.