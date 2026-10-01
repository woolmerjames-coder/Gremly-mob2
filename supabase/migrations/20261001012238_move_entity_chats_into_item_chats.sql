-- Move every item's old chat into that item's chat.
--
-- Before Ask Gremly became the chat for one item (components/chat/ItemChatScreen.tsx),
-- each todo, habit and note kept its own chat in views.chat.messages. An item's chat
-- is now a general chat whose opener carries the item as its anchor
-- (metadata_json {type: 'chat-anchor', anchor: {id, type, title}}; lib/chat/itemChat.ts
-- finds it). This copies each old chat into one: Gremly's opener first, then the old
-- messages in their order and with their times, and the item's chat summary as the
-- chat's running summary. When an item already has its chat, the old messages go into
-- that chat, before its opener.
--
-- Nothing is removed: views.chat stays on the items as a copy. Every row added here
-- carries metadata_json.migrated_from = 'views.chat' (and the item's id), so it can
-- be found or taken out again, and an item already moved is skipped, so running this
-- twice adds nothing. Empty messages (streams that failed) are left out, and a hidden
-- save block left in an old reply is removed from its text.

DO $$
DECLARE
  r record;
  chat uuid;
  first_at timestamptz;
  last_at timestamptz;
  last_text text;
  moved jsonb;
BEGIN
  FOR r IN
    SELECT items.*
    FROM (
      SELECT 'todo'::text AS kind, t.id, t.owner_id,
             left(coalesce(nullif(trim(t.name), ''), nullif(trim(t.title), ''), 'Todo'), 120) AS title,
             t.views->'chat'->'messages' AS msgs, t.chat_summary
      FROM todos t WHERE jsonb_typeof(t.views->'chat'->'messages') = 'array'
      UNION ALL
      SELECT 'habit', h.id, h.owner_id,
             left(coalesce(nullif(trim(h.name), ''), nullif(trim(h.title), ''), 'Habit'), 120),
             h.views->'chat'->'messages', h.chat_summary
      FROM habits h WHERE jsonb_typeof(h.views->'chat'->'messages') = 'array'
      UNION ALL
      SELECT 'note', n.id, n.owner_id,
             left(coalesce(nullif(trim(n.title), ''), 'Note'), 120),
             n.views->'chat'->'messages', n.chat_summary
      FROM notes n WHERE jsonb_typeof(n.views->'chat'->'messages') = 'array'
    ) items
    WHERE items.owner_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM scope_chat_messages done
        WHERE done.user_id = items.owner_id
          AND done.metadata_json->>'migrated_from' = 'views.chat'
          AND done.metadata_json->>'item_id' = items.id::text
      )
  LOOP
    -- the old messages worth keeping, in order: a microsecond per position keeps
    -- two messages saved at the same moment in the order they were written
    CREATE TEMP TABLE IF NOT EXISTS moving (role text, content text, at timestamptz) ON COMMIT DROP;
    TRUNCATE moving;
    INSERT INTO moving (role, content, at)
    SELECT m.msg->>'role',
           trim(regexp_replace(coalesce(m.msg->>'content', ''), '<!--SAVE:.*?-->', '', 'g')),
           (m.msg->>'created_at')::timestamptz + (m.ord * interval '1 microsecond')
    FROM jsonb_array_elements(r.msgs) WITH ORDINALITY AS m(msg, ord)
    WHERE m.msg->>'role' IN ('user', 'assistant')
      AND (m.msg->>'created_at') ~ '^\d{4}-\d{2}-\d{2}T';
    DELETE FROM moving WHERE content = '';
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM moving);

    SELECT min(at), max(at) INTO first_at, last_at FROM moving;
    SELECT content INTO last_text FROM moving ORDER BY at DESC LIMIT 1;
    moved := jsonb_build_object('migrated_from', 'views.chat', 'item_id', r.id::text, 'item_type', r.kind);

    -- the item's chat, when it already has one
    SELECT o.chat_id INTO chat
    FROM scope_chat_messages o
    JOIN scope_chats c ON c.id = o.chat_id AND c.archived_at IS NULL
    WHERE o.user_id = r.owner_id
      AND o.metadata_json->>'type' = 'chat-anchor'
      AND o.metadata_json->'anchor'->>'id' = r.id::text
    ORDER BY c.updated_at DESC
    LIMIT 1;

    IF chat IS NULL THEN
      INSERT INTO scope_chats (user_id, scope_id, chat_type, title, pinned, created_at, updated_at,
                               last_message_snippet, running_summary, metadata_json)
      VALUES (r.owner_id, NULL, 'general', left(r.title, 60), false,
              first_at - interval '1 second', last_at, left(last_text, 140),
              nullif(trim(coalesce(r.chat_summary, '')), ''), moved)
      RETURNING id INTO chat;

      -- Gremly's opener, which ties the chat to the item
      INSERT INTO scope_chat_messages (chat_id, user_id, scope_id, role, content, metadata_json, created_at)
      VALUES (chat, r.owner_id, NULL, 'assistant',
              'Sure, let''s talk about **' || r.title || '**. What''s on your mind?',
              moved || jsonb_build_object('type', 'chat-anchor',
                                          'anchor', jsonb_build_object('id', r.id::text, 'type', r.kind, 'title', r.title)),
              first_at - interval '1 second');
    END IF;

    INSERT INTO scope_chat_messages (chat_id, user_id, scope_id, role, content, metadata_json, created_at)
    SELECT chat, r.owner_id, NULL, role, content, moved, at FROM moving ORDER BY at;

    chat := NULL;
  END LOOP;
END $$;

-- Applied 1 Oct 2026: 127 chats (77 todos, 27 notes, 23 habits), 701 messages,
-- 13 people; every chat starts with its opener; 6 carried a chat summary over.
