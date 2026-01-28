export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.5';
  };
  public: {
    Tables: {
      cortex_preferences: {
        Row: {
          brevity: string | null;
          dnd: Json | null;
          encouragement: string | null;
          evening_review: string | null;
          last_learned_at: string | null;
          last_sweep_completed_at: string | null;
          morning_preview: string | null;
          owner_id: string;
          routing_keywords: Json | null;
          tone: string | null;
          updated_at: string | null;
        };
        Insert: {
          brevity?: string | null;
          dnd?: Json | null;
          encouragement?: string | null;
          evening_review?: string | null;
          last_learned_at?: string | null;
          last_sweep_completed_at?: string | null;
          morning_preview?: string | null;
          owner_id: string;
          routing_keywords?: Json | null;
          tone?: string | null;
          updated_at?: string | null;
        };
        Update: {
          brevity?: string | null;
          dnd?: Json | null;
          encouragement?: string | null;
          evening_review?: string | null;
          last_learned_at?: string | null;
          last_sweep_completed_at?: string | null;
          morning_preview?: string | null;
          owner_id?: string;
          routing_keywords?: Json | null;
          tone?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      entity_people: {
        Row: {
          created_at: string | null;
          entity_id: string;
          entity_type: string;
          id: string | null;
          item_id: string | null;
          item_type: string | null;
          owner_id: string;
          person_id: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          entity_id: string;
          entity_type: string;
          id?: string | null;
          item_id?: string | null;
          item_type?: string | null;
          owner_id: string;
          person_id: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          entity_id?: string;
          entity_type?: string;
          id?: string | null;
          item_id?: string | null;
          item_type?: string | null;
          owner_id?: string;
          person_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'entity_people_person_id_fkey';
            columns: ['person_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      events: {
        Row: {
          created_at: string | null;
          id: string;
          kind: string;
          owner_id: string;
          payload_json: Json;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          kind: string;
          owner_id: string;
          payload_json: Json;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          kind?: string;
          owner_id?: string;
          payload_json?: Json;
        };
        Relationships: [];
      };
      focus_card: {
        Row: {
          created_at: string;
          entry_id: string | null;
          entry_type: string | null;
          expires_at: string;
          focus_day: string;
          id: string;
          owner_id: string;
          source: string;
        };
        Insert: {
          created_at?: string;
          entry_id?: string | null;
          entry_type?: string | null;
          expires_at: string;
          focus_day: string;
          id?: string;
          owner_id: string;
          source: string;
        };
        Update: {
          created_at?: string;
          entry_id?: string | null;
          entry_type?: string | null;
          expires_at?: string;
          focus_day?: string;
          id?: string;
          owner_id?: string;
          source?: string;
        };
        Relationships: [];
      };
      habit_progress: {
        Row: {
          count: number;
          habit_id: string;
          id: string;
          occurred_at: string;
          occurred_day: string;
          occurrence_index: number | null;
          owner_id: string;
        };
        Insert: {
          count?: number;
          habit_id: string;
          id?: string;
          occurred_at?: string;
          occurred_day: string;
          occurrence_index?: number | null;
          owner_id: string;
        };
        Update: {
          count?: number;
          habit_id?: string;
          id?: string;
          occurred_at?: string;
          occurred_day?: string;
          occurrence_index?: number | null;
          owner_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'habit_progress_habit_id_fkey';
            columns: ['habit_id'];
            isOneToOne: false;
            referencedRelation: 'habits';
            referencedColumns: ['id'];
          },
        ];
      };
      habits: {
        Row: {
          ai_placed: boolean;
          archived: boolean;
          archived_at: string | null;
          archived_reason: string | null;
          body_legacy: string | null;
          buddy_email: string | null;
          buddy_id: string | null;
          cadence: string;
          canonical_type: string | null;
          commitment: boolean | null;
          commitment_archived_at: string | null;
          commitment_note: string | null;
          commitment_started_at: string | null;
          completed_at: string | null;
          created_at: string | null;
          days_active: string[] | null;
          drop_id: string | null;
          end_date: string | null;
          frequency: string;
          frequency_json: Json | null;
          has_list: boolean;
          id: string;
          labels: Json | null;
          last_completed_at: string | null;
          last_reset_date: string | null;
          list_items: Json | null;
          list_template_id: string | null;
          locked_in: boolean;
          locked_in_at: string | null;
          name: string;
          notes: string | null;
          origin: string | null;
          owner_id: string;
          period_start_at: string | null;
          period_unit: string;
          reminders_json: Json | null;
          replacement_habit_id: string | null;
          replacement_text: string | null;
          skipped_in_sweep_at: string | null;
          source_message_id: string | null;
          space_id: string | null;
          stack_offset_minutes: number | null;
          stack_position: string | null;
          stack_with_id: string | null;
          start_date: string | null;
          subtype: string;
          tags: string[] | null;
          tags_meta: Json | null;
          taper_plan: Json | null;
          target_count: number;
          target_per_day: number | null;
          target_per_period: number | null;
          time_window: string;
          title: string;
          triggers_json: Json | null;
          updated_at: string | null;
          views: Json | null;
          why_string: string | null;
        };
        Insert: {
          ai_placed?: boolean;
          archived?: boolean;
          archived_at?: string | null;
          archived_reason?: string | null;
          body_legacy?: string | null;
          buddy_email?: string | null;
          buddy_id?: string | null;
          cadence?: string;
          canonical_type?: string | null;
          commitment?: boolean | null;
          commitment_archived_at?: string | null;
          commitment_note?: string | null;
          commitment_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          days_active?: string[] | null;
          drop_id?: string | null;
          end_date?: string | null;
          frequency?: string;
          frequency_json?: Json | null;
          has_list?: boolean;
          id?: string;
          labels?: Json | null;
          last_completed_at?: string | null;
          last_reset_date?: string | null;
          list_items?: Json | null;
          list_template_id?: string | null;
          locked_in?: boolean;
          locked_in_at?: string | null;
          name: string;
          notes?: string | null;
          origin?: string | null;
          owner_id: string;
          period_start_at?: string | null;
          period_unit?: string;
          reminders_json?: Json | null;
          replacement_habit_id?: string | null;
          replacement_text?: string | null;
          skipped_in_sweep_at?: string | null;
          source_message_id?: string | null;
          space_id?: string | null;
          stack_offset_minutes?: number | null;
          stack_position?: string | null;
          stack_with_id?: string | null;
          start_date?: string | null;
          subtype?: string;
          tags?: string[] | null;
          tags_meta?: Json | null;
          taper_plan?: Json | null;
          target_count?: number;
          target_per_day?: number | null;
          target_per_period?: number | null;
          time_window?: string;
          title: string;
          triggers_json?: Json | null;
          updated_at?: string | null;
          views?: Json | null;
          why_string?: string | null;
        };
        Update: {
          ai_placed?: boolean;
          archived?: boolean;
          archived_at?: string | null;
          archived_reason?: string | null;
          body_legacy?: string | null;
          buddy_email?: string | null;
          buddy_id?: string | null;
          cadence?: string;
          canonical_type?: string | null;
          commitment?: boolean | null;
          commitment_archived_at?: string | null;
          commitment_note?: string | null;
          commitment_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          days_active?: string[] | null;
          drop_id?: string | null;
          end_date?: string | null;
          frequency?: string;
          frequency_json?: Json | null;
          has_list?: boolean;
          id?: string;
          labels?: Json | null;
          last_completed_at?: string | null;
          last_reset_date?: string | null;
          list_items?: Json | null;
          list_template_id?: string | null;
          locked_in?: boolean;
          locked_in_at?: string | null;
          name?: string;
          notes?: string | null;
          origin?: string | null;
          owner_id?: string;
          period_start_at?: string | null;
          period_unit?: string;
          reminders_json?: Json | null;
          replacement_habit_id?: string | null;
          replacement_text?: string | null;
          skipped_in_sweep_at?: string | null;
          source_message_id?: string | null;
          space_id?: string | null;
          stack_offset_minutes?: number | null;
          stack_position?: string | null;
          stack_with_id?: string | null;
          start_date?: string | null;
          subtype?: string;
          tags?: string[] | null;
          tags_meta?: Json | null;
          taper_plan?: Json | null;
          target_count?: number;
          target_per_day?: number | null;
          target_per_period?: number | null;
          time_window?: string;
          title?: string;
          triggers_json?: Json | null;
          updated_at?: string | null;
          views?: Json | null;
          why_string?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'habits_list_template_fk';
            columns: ['list_template_id'];
            isOneToOne: false;
            referencedRelation: 'list_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      list_items: {
        Row: {
          completed_at: string | null;
          created_at: string | null;
          id: string;
          label: string;
          list_id: string;
          meta_json: Json | null;
          qty: number | null;
          unit: string | null;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string | null;
          id?: string;
          label: string;
          list_id: string;
          meta_json?: Json | null;
          qty?: number | null;
          unit?: string | null;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string | null;
          id?: string;
          label?: string;
          list_id?: string;
          meta_json?: Json | null;
          qty?: number | null;
          unit?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'list_items_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'lists';
            referencedColumns: ['id'];
          },
        ];
      };
      list_templates: {
        Row: {
          created_at: string;
          id: string;
          items: Json;
          name: string;
          owner_id: string;
          scope: string;
          source_entity_id: string | null;
          source_entity_type: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          items?: Json;
          name: string;
          owner_id: string;
          scope?: string;
          source_entity_id?: string | null;
          source_entity_type?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          items?: Json;
          name?: string;
          owner_id?: string;
          scope?: string;
          source_entity_id?: string | null;
          source_entity_type?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      lists: {
        Row: {
          created_at: string | null;
          id: string;
          key: string;
          name: string;
          owner_id: string;
          space_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          key: string;
          name: string;
          owner_id: string;
          space_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          key?: string;
          name?: string;
          owner_id?: string;
          space_id?: string | null;
        };
        Relationships: [];
      };
      log_photos: {
        Row: {
          created_at: string;
          id: string;
          note_id: string;
          owner_id: string;
          position: number;
          url: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          note_id: string;
          owner_id: string;
          position?: number;
          url: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          note_id?: string;
          owner_id?: string;
          position?: number;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'log_photos_note_id_fkey';
            columns: ['note_id'];
            isOneToOne: false;
            referencedRelation: 'notes';
            referencedColumns: ['id'];
          },
        ];
      };
      notes: {
        Row: {
          ai_placed: boolean;
          archived: boolean;
          archived_at: string | null;
          archived_reason: string | null;
          body: string | null;
          body_legacy: string | null;
          canonical_type: string | null;
          created_at: string | null;
          date: string | null;
          drop_id: string | null;
          event_time: string | null;
          fmt: string | null;
          has_list: boolean;
          id: string;
          is_favorite: boolean;
          is_pinned: boolean;
          journal_subtype: string | null;
          labels: Json | null;
          list_items: Json | null;
          mood: string[] | null;
          needs_clarification: boolean;
          origin: string | null;
          owner_id: string;
          reminder_date: string | null;
          reminders_json: Json | null;
          resurface_at: string | null;
          skipped_in_sweep_at: string | null;
          source_message_id: string | null;
          space_id: string | null;
          subtype: string | null;
          swept_at: string | null;
          tags: Json | null;
          tags_meta: Json | null;
          target_date: string | null;
          title: string;
          updated_at: string | null;
          views: Json | null;
          why_string: string | null;
        };
        Insert: {
          ai_placed?: boolean;
          archived?: boolean;
          archived_at?: string | null;
          archived_reason?: string | null;
          body?: string | null;
          body_legacy?: string | null;
          canonical_type?: string | null;
          created_at?: string | null;
          date?: string | null;
          drop_id?: string | null;
          event_time?: string | null;
          fmt?: string | null;
          has_list?: boolean;
          id?: string;
          is_favorite?: boolean;
          is_pinned?: boolean;
          journal_subtype?: string | null;
          labels?: Json | null;
          list_items?: Json | null;
          mood?: string[] | null;
          needs_clarification?: boolean;
          origin?: string | null;
          owner_id: string;
          reminder_date?: string | null;
          reminders_json?: Json | null;
          resurface_at?: string | null;
          skipped_in_sweep_at?: string | null;
          source_message_id?: string | null;
          space_id?: string | null;
          subtype?: string | null;
          swept_at?: string | null;
          tags?: Json | null;
          tags_meta?: Json | null;
          target_date?: string | null;
          title: string;
          updated_at?: string | null;
          views?: Json | null;
          why_string?: string | null;
        };
        Update: {
          ai_placed?: boolean;
          archived?: boolean;
          archived_at?: string | null;
          archived_reason?: string | null;
          body?: string | null;
          body_legacy?: string | null;
          canonical_type?: string | null;
          created_at?: string | null;
          date?: string | null;
          drop_id?: string | null;
          event_time?: string | null;
          fmt?: string | null;
          has_list?: boolean;
          id?: string;
          is_favorite?: boolean;
          is_pinned?: boolean;
          journal_subtype?: string | null;
          labels?: Json | null;
          list_items?: Json | null;
          mood?: string[] | null;
          needs_clarification?: boolean;
          origin?: string | null;
          owner_id?: string;
          reminder_date?: string | null;
          reminders_json?: Json | null;
          resurface_at?: string | null;
          skipped_in_sweep_at?: string | null;
          source_message_id?: string | null;
          space_id?: string | null;
          subtype?: string | null;
          swept_at?: string | null;
          tags?: Json | null;
          tags_meta?: Json | null;
          target_date?: string | null;
          title?: string;
          updated_at?: string | null;
          views?: Json | null;
          why_string?: string | null;
        };
        Relationships: [];
      };
      people: {
        Row: {
          created_at: string | null;
          dates_json: Json | null;
          display_name: string | null;
          email: string | null;
          id: string;
          name: string | null;
          notes: string | null;
          notes_fmt: string | null;
          owner_id: string;
          reminders_json: Json | null;
          space_id: string | null;
          tags: Json | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          dates_json?: Json | null;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          name?: string | null;
          notes?: string | null;
          notes_fmt?: string | null;
          owner_id: string;
          reminders_json?: Json | null;
          space_id?: string | null;
          tags?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          dates_json?: Json | null;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          name?: string | null;
          notes?: string | null;
          notes_fmt?: string | null;
          owner_id?: string;
          reminders_json?: Json | null;
          space_id?: string | null;
          tags?: Json | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      relations: {
        Row: {
          created_at: string | null;
          dst_item_id: string | null;
          dst_space_id: string | null;
          id: string;
          owner_id: string;
          rel: string;
          src_item_id: string;
        };
        Insert: {
          created_at?: string | null;
          dst_item_id?: string | null;
          dst_space_id?: string | null;
          id?: string;
          owner_id: string;
          rel: string;
          src_item_id: string;
        };
        Update: {
          created_at?: string | null;
          dst_item_id?: string | null;
          dst_space_id?: string | null;
          id?: string;
          owner_id?: string;
          rel?: string;
          src_item_id?: string;
        };
        Relationships: [];
      };
      space_chat_messages: {
        Row: {
          chat_id: string;
          content: string;
          created_at: string | null;
          id: string;
          metadata: Json | null;
          metadata_json: Json | null;
          role: string;
          space_id: string;
          user_id: string;
        };
        Insert: {
          chat_id: string;
          content: string;
          created_at?: string | null;
          id?: string;
          metadata?: Json | null;
          metadata_json?: Json | null;
          role?: string;
          space_id: string;
          user_id: string;
        };
        Update: {
          chat_id?: string;
          content?: string;
          created_at?: string | null;
          id?: string;
          metadata?: Json | null;
          metadata_json?: Json | null;
          role?: string;
          space_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'space_chat_messages_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: false;
            referencedRelation: 'space_chats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'space_chat_messages_space_id_fkey';
            columns: ['space_id'];
            isOneToOne: false;
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
      };
      space_chats: {
        Row: {
          archived_at: string | null;
          created_at: string | null;
          id: string;
          last_message_snippet: string | null;
          metadata_json: Json | null;
          pinned: boolean | null;
          running_summary: string | null;
          space_id: string | null;
          title: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string | null;
          id?: string;
          last_message_snippet?: string | null;
          metadata_json?: Json | null;
          pinned?: boolean | null;
          running_summary?: string | null;
          space_id?: string | null;
          title: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string | null;
          id?: string;
          last_message_snippet?: string | null;
          metadata_json?: Json | null;
          pinned?: boolean | null;
          running_summary?: string | null;
          space_id?: string | null;
          title?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'space_chats_space_id_fkey';
            columns: ['space_id'];
            isOneToOne: false;
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
      };
      space_milestones: {
        Row: {
          created_at: string | null;
          date: string;
          id: string;
          note: string | null;
          owner_id: string;
          space_id: string | null;
          title: string;
        };
        Insert: {
          created_at?: string | null;
          date: string;
          id?: string;
          note?: string | null;
          owner_id: string;
          space_id?: string | null;
          title: string;
        };
        Update: {
          created_at?: string | null;
          date?: string;
          id?: string;
          note?: string | null;
          owner_id?: string;
          space_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'space_milestones_space_id_fkey';
            columns: ['space_id'];
            isOneToOne: false;
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
      };
      space_summaries: {
        Row: {
          created_at: string;
          extracted_bullets: Json;
          id: string;
          last_message_id: string | null;
          model: string;
          source_window: number;
          space_id: string;
          summary: string;
          token_usage: number;
        };
        Insert: {
          created_at?: string;
          extracted_bullets?: Json;
          id?: string;
          last_message_id?: string | null;
          model: string;
          source_window?: number;
          space_id: string;
          summary: string;
          token_usage?: number;
        };
        Update: {
          created_at?: string;
          extracted_bullets?: Json;
          id?: string;
          last_message_id?: string | null;
          model?: string;
          source_window?: number;
          space_id?: string;
          summary?: string;
          token_usage?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'space_summaries_space_id_fkey';
            columns: ['space_id'];
            isOneToOne: false;
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
      };
      spaces: {
        Row: {
          archived_at: string | null;
          created_at: string | null;
          defaults_json: Json | null;
          icon: string | null;
          id: string;
          last_summary: string | null;
          last_summary_at: string | null;
          last_summary_tokens: number | null;
          layout_state_json: Json | null;
          name: string;
          owner_id: string;
          summary_cached: string | null;
          summary_updated_at: string | null;
          theme: string | null;
          updated_at: string | null;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string | null;
          defaults_json?: Json | null;
          icon?: string | null;
          id?: string;
          last_summary?: string | null;
          last_summary_at?: string | null;
          last_summary_tokens?: number | null;
          layout_state_json?: Json | null;
          name: string;
          owner_id: string;
          summary_cached?: string | null;
          summary_updated_at?: string | null;
          theme?: string | null;
          updated_at?: string | null;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string | null;
          defaults_json?: Json | null;
          icon?: string | null;
          id?: string;
          last_summary?: string | null;
          last_summary_at?: string | null;
          last_summary_tokens?: number | null;
          layout_state_json?: Json | null;
          name?: string;
          owner_id?: string;
          summary_cached?: string | null;
          summary_updated_at?: string | null;
          theme?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      tag_map: {
        Row: {
          created_at: string | null;
          entity_id: string;
          entity_type: string;
          item_id: string | null;
          item_type: string | null;
          owner_id: string;
          tag_id: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          entity_id: string;
          entity_type: string;
          item_id?: string | null;
          item_type?: string | null;
          owner_id: string;
          tag_id: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          entity_id?: string;
          entity_type?: string;
          item_id?: string | null;
          item_type?: string | null;
          owner_id?: string;
          tag_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'tag_map_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'tags';
            referencedColumns: ['id'];
          },
        ];
      };
      tags: {
        Row: {
          color: string | null;
          created_at: string | null;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          color?: string | null;
          created_at?: string | null;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          color?: string | null;
          created_at?: string | null;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      todos: {
        Row: {
          ai_placed: boolean;
          archived: boolean;
          archived_at: string | null;
          archived_reason: string | null;
          body: string | null;
          body_legacy: string | null;
          canonical_type: string | null;
          carry_forward: boolean;
          commitment: boolean | null;
          commitment_archived_at: string | null;
          commitment_note: string | null;
          commitment_started_at: string | null;
          completed_at: string | null;
          created_at: string | null;
          drop_id: string | null;
          due_date: string | null;
          due_day: string | null;
          due_time: string | null;
          has_list: boolean;
          id: string;
          labels: Json | null;
          list_items: Json | null;
          locked_in: boolean;
          locked_in_at: string | null;
          name: string;
          notes: string | null;
          origin: string | null;
          owner_id: string;
          reminders_json: Json | null;
          resurface_at: string | null;
          scheduled_date: string | null;
          skipped_in_sweep_at: string | null;
          source_message_id: string | null;
          space_id: string | null;
          status: string;
          subtype: string | null;
          sweep_reschedule_count: number | null;
          tags: Json | null;
          tags_meta: Json | null;
          target_date: string | null;
          title: string;
          undefined_due: boolean | null;
          updated_at: string | null;
          views: Json | null;
          why_string: string | null;
        };
        Insert: {
          ai_placed?: boolean;
          archived?: boolean;
          archived_at?: string | null;
          archived_reason?: string | null;
          body?: string | null;
          body_legacy?: string | null;
          canonical_type?: string | null;
          carry_forward?: boolean;
          commitment?: boolean | null;
          commitment_archived_at?: string | null;
          commitment_note?: string | null;
          commitment_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          drop_id?: string | null;
          due_date?: string | null;
          due_day?: string | null;
          due_time?: string | null;
          has_list?: boolean;
          id?: string;
          labels?: Json | null;
          list_items?: Json | null;
          locked_in?: boolean;
          locked_in_at?: string | null;
          name: string;
          notes?: string | null;
          origin?: string | null;
          owner_id: string;
          reminders_json?: Json | null;
          resurface_at?: string | null;
          scheduled_date?: string | null;
          skipped_in_sweep_at?: string | null;
          source_message_id?: string | null;
          space_id?: string | null;
          status?: string;
          subtype?: string | null;
          sweep_reschedule_count?: number | null;
          tags?: Json | null;
          tags_meta?: Json | null;
          target_date?: string | null;
          title: string;
          undefined_due?: boolean | null;
          updated_at?: string | null;
          views?: Json | null;
          why_string?: string | null;
        };
        Update: {
          ai_placed?: boolean;
          archived?: boolean;
          archived_at?: string | null;
          archived_reason?: string | null;
          body?: string | null;
          body_legacy?: string | null;
          canonical_type?: string | null;
          carry_forward?: boolean;
          commitment?: boolean | null;
          commitment_archived_at?: string | null;
          commitment_note?: string | null;
          commitment_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          drop_id?: string | null;
          due_date?: string | null;
          due_day?: string | null;
          due_time?: string | null;
          has_list?: boolean;
          id?: string;
          labels?: Json | null;
          list_items?: Json | null;
          locked_in?: boolean;
          locked_in_at?: string | null;
          name?: string;
          notes?: string | null;
          origin?: string | null;
          owner_id?: string;
          reminders_json?: Json | null;
          resurface_at?: string | null;
          scheduled_date?: string | null;
          skipped_in_sweep_at?: string | null;
          source_message_id?: string | null;
          space_id?: string | null;
          status?: string;
          subtype?: string | null;
          sweep_reschedule_count?: number | null;
          tags?: Json | null;
          tags_meta?: Json | null;
          target_date?: string | null;
          title?: string;
          undefined_due?: boolean | null;
          updated_at?: string | null;
          views?: Json | null;
          why_string?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      view_today_items: {
        Row: {
          completed: boolean | null;
          due_at: string | null;
          id: string | null;
          inserted_at: string | null;
          kind: string | null;
          title: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      complete_habit: { Args: { _id: string }; Returns: Json };
      complete_item: { Args: { _id: string; _kind: string }; Returns: Json };
      convert_or_create_from_drop: {
        Args: {
          p_drop_id: string;
          p_owner: string;
          p_payload: Json;
          p_target: string;
        };
        Returns: string;
      };
      get_latest_space_summary: {
        Args: { p_space: string };
        Returns: {
          created_at: string;
          extracted_bullets: Json;
          id: string;
          summary: string;
        }[];
      };
      get_rolling_habits: {
        Args: never;
        Returns: {
          cadence: Database['public']['Enums']['cadence_type'];
          id: string;
          last_completed_at: string;
          name: string;
          period_count: number;
          should_surface_today: boolean;
          target_per_day: number;
          target_per_period: number;
          today_count: number;
        }[];
      };
      list_checks: {
        Args: { tbl: string };
        Returns: {
          check_clause: string;
          constraint_name: string;
        }[];
      };
      list_columns: {
        Args: { tbl: string };
        Returns: {
          column_name: string;
          data_type: string;
        }[];
      };
      period_start: {
        Args: { _cadence: Database['public']['Enums']['cadence_type'] };
        Returns: string;
      };
      uuid_generate_v4: { Args: never; Returns: string };
    };
    Enums: {
      cadence_type: 'daily' | 'weekly' | 'monthly';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      cadence_type: ['daily', 'weekly', 'monthly'],
    },
  },
} as const;
