# Phase 10.5 Schema Notes

## Space Chat Messages Table

### Purpose
The `space_chat_messages` table stores individual chat messages within space chat threads. Each message belongs to a specific chat thread (`space_chats`) and maintains conversation history for AI-powered chat functionality.

### Table Structure
- **Table**: `public.space_chat_messages`
- **Primary Key**: `id` (uuid)
- **Foreign Key**: `chat_id` → `public.space_chats(id)` with cascade delete
- **User Ownership**: `user_id` (uuid, not enforced FK to allow flexibility)

### Naming Convention Clarification
We use **singular** table naming throughout the schema:
- ✅ `space_chats` (correct, singular)
- ❌ `spaces_chats` (incorrect, would be plural)

This follows our established naming convention where table names are singular (e.g., `users`, `todos`, `habits`, `notes`).

### Row Level Security (RLS)
- **SELECT**: Users can read their own messages OR assistant messages in chats they own
- **INSERT/UPDATE/DELETE**: Users can only modify their own messages
- All policies require authentication (`auth.uid()`)

### Usage Pattern
1. User creates a chat thread in `space_chats`
2. Messages are stored in `space_chat_messages` with `chat_id` reference
3. Both user and assistant messages use the same user's `user_id` for ownership
4. Assistant messages are distinguished by `role = 'assistant'`

### Indexes
- `idx_scm_chat_id`: Fast lookup by chat thread
- `idx_scm_user_id`: Fast lookup by user
- `idx_scm_created_at`: Chronological ordering