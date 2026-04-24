export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.5';
  };
  public: {
    Tables: {
      calendar_events: {
        Row: {
          chat_data: Json | null;
          created_at: string | null;
          duration_minutes: number | null;
          event_date: string;
          event_time: string | null;
          id: string;
          notes: string | null;
          owner_id: string;
          source: string;
          space_id: string | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          chat_data?: Json | null;
          created_at?: string | null;
          duration_minutes?: number | null;
          event_date: string;
          event_time?: string | null;
          id?: string;
          notes?: string | null;
          owner_id: string;
          source?: string;
          space_id?: string | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          chat_data?: Json | null;
          created_at?: string | null;
          duration_minutes?: number | null;
          event_date?: string;
          event_time?: string | null;
          id?: string;
          notes?: string | null;
          owner_id?: string;
          source?: string;
          space_id?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_events_space_id_fkey';
            columns: ['space_id'];
            isOneToOne: false;
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_tokens: {
        Row: {
          access_token: string;
          access_token_expires_at: string;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          last_error: string | null;
          last_synced_at: string | null;
          owner_id: string;
          provider: string;
          provider_account_id: string | null;
          provider_email: string | null;
          refresh_token: string;
          updated_at: string | null;
        };
        Insert: {
          access_token: string;
          access_token_expires_at: string;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          last_error?: string | null;
          last_synced_at?: string | null;
          owner_id: string;
          provider: string;
          provider_account_id?: string | null;
          provider_email?: string | null;
          refresh_token: string;
          updated_at?: string | null;
        };
        Update: {
          access_token?: string;
          access_token_expires_at?: string;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          last_error?: string | null;
          last_synced_at?: string | null;
          owner_id?: string;
          provider?: string;
          provider_account_id?: string | null;
          provider_email?: string | null;
          refresh_token?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      chapter_world_links: {
        Row: {
          chapter_id: string;
          owner_id: string;
          relevance_score: number;
          world_id: string;
        };
        Insert: {
          chapter_id: string;
          owner_id: string;
          relevance_score?: number;
          world_id: string;
        };
        Update: {
          chapter_id?: string;
          owner_id?: string;
          relevance_score?: number;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chapter_world_links_chapter_id_fkey';
            columns: ['chapter_id'];
            isOneToOne: false;
            referencedRelation: 'chapters';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chapter_world_links_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      chapters: {
        Row: {
          arc_shape: string | null;
          arc_shape_source: string | null;
          arc_shape_updated_at: string | null;
          card_subtitle: string | null;
          card_subtitle_source: string | null;
          card_subtitle_updated_at: string | null;
          chapter_type: string;
          closed_at: string | null;
          confidence: number | null;
          confirmed_at: string | null;
          created_at: string;
          current_phase_key: string | null;
          description: string | null;
          end_date: string | null;
          epigraph: string | null;
          epigraph_accepted_at: string | null;
          epigraph_source: string | null;
          epigraph_updated_at: string | null;
          has_blockers_count: number;
          id: string;
          key_moments: Json | null;
          key_moments_source: string | null;
          key_moments_updated_at: string | null;
          key_priorities: Json | null;
          last_run_id: string | null;
          owner_id: string;
          phase: string;
          phase_labels: Json | null;
          primary_world_id: string | null;
          proposed_at: string | null;
          slip_events: Json | null;
          slip_events_source: string | null;
          slip_events_updated_at: string | null;
          slip_tracking_enabled: boolean;
          source: string;
          start_date: string | null;
          summary: string | null;
          summary_source: string | null;
          summary_updated_at: string | null;
          target_description: string | null;
          target_summary: string | null;
          title: string;
          title_source: string | null;
          title_updated_at: string | null;
          updated_at: string;
        };
        Insert: {
          arc_shape?: string | null;
          arc_shape_source?: string | null;
          arc_shape_updated_at?: string | null;
          card_subtitle?: string | null;
          card_subtitle_source?: string | null;
          card_subtitle_updated_at?: string | null;
          chapter_type: string;
          closed_at?: string | null;
          confidence?: number | null;
          confirmed_at?: string | null;
          created_at?: string;
          current_phase_key?: string | null;
          description?: string | null;
          end_date?: string | null;
          epigraph?: string | null;
          epigraph_accepted_at?: string | null;
          epigraph_source?: string | null;
          epigraph_updated_at?: string | null;
          has_blockers_count?: number;
          id?: string;
          key_moments?: Json | null;
          key_moments_source?: string | null;
          key_moments_updated_at?: string | null;
          key_priorities?: Json | null;
          last_run_id?: string | null;
          owner_id: string;
          phase?: string;
          phase_labels?: Json | null;
          primary_world_id?: string | null;
          proposed_at?: string | null;
          slip_events?: Json | null;
          slip_events_source?: string | null;
          slip_events_updated_at?: string | null;
          slip_tracking_enabled?: boolean;
          source: string;
          start_date?: string | null;
          summary?: string | null;
          summary_source?: string | null;
          summary_updated_at?: string | null;
          target_description?: string | null;
          target_summary?: string | null;
          title: string;
          title_source?: string | null;
          title_updated_at?: string | null;
          updated_at?: string;
        };
        Update: {
          arc_shape?: string | null;
          arc_shape_source?: string | null;
          arc_shape_updated_at?: string | null;
          card_subtitle?: string | null;
          card_subtitle_source?: string | null;
          card_subtitle_updated_at?: string | null;
          chapter_type?: string;
          closed_at?: string | null;
          confidence?: number | null;
          confirmed_at?: string | null;
          created_at?: string;
          current_phase_key?: string | null;
          description?: string | null;
          end_date?: string | null;
          epigraph?: string | null;
          epigraph_accepted_at?: string | null;
          epigraph_source?: string | null;
          epigraph_updated_at?: string | null;
          has_blockers_count?: number;
          id?: string;
          key_moments?: Json | null;
          key_moments_source?: string | null;
          key_moments_updated_at?: string | null;
          key_priorities?: Json | null;
          last_run_id?: string | null;
          owner_id?: string;
          phase?: string;
          phase_labels?: Json | null;
          primary_world_id?: string | null;
          proposed_at?: string | null;
          slip_events?: Json | null;
          slip_events_source?: string | null;
          slip_events_updated_at?: string | null;
          slip_tracking_enabled?: boolean;
          source?: string;
          start_date?: string | null;
          summary?: string | null;
          summary_source?: string | null;
          summary_updated_at?: string | null;
          target_description?: string | null;
          target_summary?: string | null;
          title?: string;
          title_source?: string | null;
          title_updated_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chapters_primary_world_id_fkey';
            columns: ['primary_world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      cortex_preferences: {
        Row: {
          ai_mode: string | null;
          brevity: string | null;
          challenge_completed_at: string | null;
          challenge_started_at: string | null;
          created_at: string | null;
          current_tier: string | null;
          day_boundary_hour: number | null;
          demo_sweep_completed_at: string | null;
          dnd: Json | null;
          encouragement: string | null;
          evening_review: string | null;
          fed_days_count: number | null;
          first_drop_completed_at: string | null;
          first_today_visit_completed_at: string | null;
          graduated_at: string | null;
          gremly_age: number | null;
          gremly_age_last_incremented_at: string | null;
          gremly_color: string;
          has_seen_entity_chat_highlight: boolean | null;
          has_seen_first_fed_modal: boolean | null;
          has_seen_gauge_explanation: boolean | null;
          has_seen_readonly_intro: boolean;
          has_seen_sweep_unlock_modal: boolean | null;
          has_seen_training_meter_auto_open: boolean | null;
          is_subscribed: boolean;
          is_tester: boolean | null;
          last_fed_at: string | null;
          last_learned_at: string | null;
          last_sweep_completed_at: string | null;
          mini_sweep_last_completed_at: string | null;
          morning_preview: string | null;
          onboarding_completed_at: string | null;
          owner_id: string;
          routing_keywords: Json | null;
          sock_count: number | null;
          sweep_streak: number | null;
          sweep_streak_last_date: string | null;
          tone: string | null;
          training_drop_step: number | null;
          training_items_completed: Json | null;
          training_level: number | null;
          trial_started_at: string | null;
          unfed_streak_days: number | null;
          updated_at: string | null;
        };
        Insert: {
          ai_mode?: string | null;
          brevity?: string | null;
          challenge_completed_at?: string | null;
          challenge_started_at?: string | null;
          created_at?: string | null;
          current_tier?: string | null;
          day_boundary_hour?: number | null;
          demo_sweep_completed_at?: string | null;
          dnd?: Json | null;
          encouragement?: string | null;
          evening_review?: string | null;
          fed_days_count?: number | null;
          first_drop_completed_at?: string | null;
          first_today_visit_completed_at?: string | null;
          graduated_at?: string | null;
          gremly_age?: number | null;
          gremly_age_last_incremented_at?: string | null;
          gremly_color?: string;
          has_seen_entity_chat_highlight?: boolean | null;
          has_seen_first_fed_modal?: boolean | null;
          has_seen_gauge_explanation?: boolean | null;
          has_seen_readonly_intro?: boolean;
          has_seen_sweep_unlock_modal?: boolean | null;
          has_seen_training_meter_auto_open?: boolean | null;
          is_subscribed?: boolean;
          is_tester?: boolean | null;
          last_fed_at?: string | null;
          last_learned_at?: string | null;
          last_sweep_completed_at?: string | null;
          mini_sweep_last_completed_at?: string | null;
          morning_preview?: string | null;
          onboarding_completed_at?: string | null;
          owner_id: string;
          routing_keywords?: Json | null;
          sock_count?: number | null;
          sweep_streak?: number | null;
          sweep_streak_last_date?: string | null;
          tone?: string | null;
          training_drop_step?: number | null;
          training_items_completed?: Json | null;
          training_level?: number | null;
          trial_started_at?: string | null;
          unfed_streak_days?: number | null;
          updated_at?: string | null;
        };
        Update: {
          ai_mode?: string | null;
          brevity?: string | null;
          challenge_completed_at?: string | null;
          challenge_started_at?: string | null;
          created_at?: string | null;
          current_tier?: string | null;
          day_boundary_hour?: number | null;
          demo_sweep_completed_at?: string | null;
          dnd?: Json | null;
          encouragement?: string | null;
          evening_review?: string | null;
          fed_days_count?: number | null;
          first_drop_completed_at?: string | null;
          first_today_visit_completed_at?: string | null;
          graduated_at?: string | null;
          gremly_age?: number | null;
          gremly_age_last_incremented_at?: string | null;
          gremly_color?: string;
          has_seen_entity_chat_highlight?: boolean | null;
          has_seen_first_fed_modal?: boolean | null;
          has_seen_gauge_explanation?: boolean | null;
          has_seen_readonly_intro?: boolean;
          has_seen_sweep_unlock_modal?: boolean | null;
          has_seen_training_meter_auto_open?: boolean | null;
          is_subscribed?: boolean;
          is_tester?: boolean | null;
          last_fed_at?: string | null;
          last_learned_at?: string | null;
          last_sweep_completed_at?: string | null;
          mini_sweep_last_completed_at?: string | null;
          morning_preview?: string | null;
          onboarding_completed_at?: string | null;
          owner_id?: string;
          routing_keywords?: Json | null;
          sock_count?: number | null;
          sweep_streak?: number | null;
          sweep_streak_last_date?: string | null;
          tone?: string | null;
          training_drop_step?: number | null;
          training_items_completed?: Json | null;
          training_level?: number | null;
          trial_started_at?: string | null;
          unfed_streak_days?: number | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      daily_briefs: {
        Row: {
          completed_at: string | null;
          created_at: string | null;
          date: string;
          day_sequence: Json | null;
          dismissed_habit_ids: string[] | null;
          evening_sequence: Json | null;
          id: string;
          morning_sequence: Json | null;
          one_thing_id: string | null;
          one_thing_type: string | null;
          owner_id: string;
          updated_at: string | null;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string | null;
          date: string;
          day_sequence?: Json | null;
          dismissed_habit_ids?: string[] | null;
          evening_sequence?: Json | null;
          id?: string;
          morning_sequence?: Json | null;
          one_thing_id?: string | null;
          one_thing_type?: string | null;
          owner_id: string;
          updated_at?: string | null;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string | null;
          date?: string;
          day_sequence?: Json | null;
          dismissed_habit_ids?: string[] | null;
          evening_sequence?: Json | null;
          id?: string;
          morning_sequence?: Json | null;
          one_thing_id?: string | null;
          one_thing_type?: string | null;
          owner_id?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      daily_ritual_progress: {
        Row: {
          created_at: string | null;
          drops_count: number | null;
          feeding_gauge_value: number | null;
          gauge_breakdown: Json | null;
          is_fed: boolean | null;
          owner_id: string;
          ritual_completed_at: string | null;
          ritual_day: string;
          sweeps_count: number | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          drops_count?: number | null;
          feeding_gauge_value?: number | null;
          gauge_breakdown?: Json | null;
          is_fed?: boolean | null;
          owner_id: string;
          ritual_completed_at?: string | null;
          ritual_day: string;
          sweeps_count?: number | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          drops_count?: number | null;
          feeding_gauge_value?: number | null;
          gauge_breakdown?: Json | null;
          is_fed?: boolean | null;
          owner_id?: string;
          ritual_completed_at?: string | null;
          ritual_day?: string;
          sweeps_count?: number | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      drop_chapter_links: {
        Row: {
          assigned_by: string;
          chapter_id: string;
          created_at: string;
          drop_id: string;
          drop_type: string;
          last_confirmed_at: string | null;
          owner_id: string;
          reason: string | null;
          relevance_score: number;
        };
        Insert: {
          assigned_by?: string;
          chapter_id: string;
          created_at?: string;
          drop_id: string;
          drop_type: string;
          last_confirmed_at?: string | null;
          owner_id: string;
          reason?: string | null;
          relevance_score?: number;
        };
        Update: {
          assigned_by?: string;
          chapter_id?: string;
          created_at?: string;
          drop_id?: string;
          drop_type?: string;
          last_confirmed_at?: string | null;
          owner_id?: string;
          reason?: string | null;
          relevance_score?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'drop_chapter_links_chapter_id_fkey';
            columns: ['chapter_id'];
            isOneToOne: false;
            referencedRelation: 'chapters';
            referencedColumns: ['id'];
          },
        ];
      };
      drop_context_links: {
        Row: {
          assigned_by: string;
          context_id: string;
          created_at: string;
          drop_id: string;
          drop_type: string;
          last_confirmed_at: string | null;
          owner_id: string;
          reason: string | null;
          relevance_score: number;
        };
        Insert: {
          assigned_by?: string;
          context_id: string;
          created_at?: string;
          drop_id: string;
          drop_type: string;
          last_confirmed_at?: string | null;
          owner_id: string;
          reason?: string | null;
          relevance_score?: number;
        };
        Update: {
          assigned_by?: string;
          context_id?: string;
          created_at?: string;
          drop_id?: string;
          drop_type?: string;
          last_confirmed_at?: string | null;
          owner_id?: string;
          reason?: string | null;
          relevance_score?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'drop_context_links_context_id_fkey';
            columns: ['context_id'];
            isOneToOne: false;
            referencedRelation: 'life_contexts';
            referencedColumns: ['id'];
          },
        ];
      };
      drop_world_links: {
        Row: {
          assigned_by: string;
          created_at: string;
          drop_id: string;
          drop_type: string;
          last_confirmed_at: string | null;
          owner_id: string;
          reason: string | null;
          relevance_score: number;
          world_id: string;
        };
        Insert: {
          assigned_by?: string;
          created_at?: string;
          drop_id: string;
          drop_type: string;
          last_confirmed_at?: string | null;
          owner_id: string;
          reason?: string | null;
          relevance_score?: number;
          world_id: string;
        };
        Update: {
          assigned_by?: string;
          created_at?: string;
          drop_id?: string;
          drop_type?: string;
          last_confirmed_at?: string | null;
          owner_id?: string;
          reason?: string | null;
          relevance_score?: number;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'drop_world_links_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
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
          boundary_rule: string | null;
          buddy_email: string | null;
          buddy_id: string | null;
          builder_mode: string | null;
          cadence: string;
          canonical_type: string | null;
          captured_at: string | null;
          chat_summary: string | null;
          chat_summary_at: string | null;
          check_in_after: number | null;
          check_in_sent: boolean | null;
          clarification_options: Json | null;
          clarification_question: string | null;
          clarification_resolved: boolean | null;
          clarification_type: string | null;
          commitment: boolean | null;
          commitment_archived_at: string | null;
          commitment_note: string | null;
          commitment_started_at: string | null;
          commitment_until: string | null;
          completed_at: string | null;
          cooldown_buffer_minutes: number | null;
          created_at: string | null;
          daily_block: string | null;
          date_confidence: string | null;
          days_active: number[] | null;
          drop_id: string | null;
          end_date: string | null;
          energy_type: string | null;
          environment_change: string | null;
          event_name: string | null;
          frequency: string;
          frequency_json: Json | null;
          has_list: boolean;
          id: string;
          is_pinned: boolean | null;
          is_restart: boolean | null;
          labels: Json | null;
          last_checked_in_at: string | null;
          last_completed_at: string | null;
          last_reset_date: string | null;
          linked_event_id: string | null;
          list_items: Json | null;
          list_template_id: string | null;
          locked_in: boolean;
          locked_in_at: string | null;
          name: string;
          needs_clarification: boolean | null;
          notes: string | null;
          origin: string | null;
          owner_id: string;
          period_start_at: string | null;
          period_unit: string;
          prep_buffer_minutes: number | null;
          reminders_json: Json | null;
          replacement_habit_id: string | null;
          replacement_text: string | null;
          restart_context: string | null;
          resurface_count: number | null;
          scheduled_start_iso: string | null;
          skipped_in_sweep_at: string | null;
          source_message_id: string | null;
          space_id: string | null;
          stack_offset_minutes: number | null;
          stack_position: string | null;
          stack_with_id: string | null;
          start_date: string | null;
          start_date_confirmed: boolean | null;
          subtype: string;
          tags: string[] | null;
          tags_meta: Json | null;
          taper_plan: Json | null;
          target_count: number;
          target_per_day: number | null;
          target_per_period: number | null;
          time_estimate_minutes: number | null;
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
          boundary_rule?: string | null;
          buddy_email?: string | null;
          buddy_id?: string | null;
          builder_mode?: string | null;
          cadence?: string;
          canonical_type?: string | null;
          captured_at?: string | null;
          chat_summary?: string | null;
          chat_summary_at?: string | null;
          check_in_after?: number | null;
          check_in_sent?: boolean | null;
          clarification_options?: Json | null;
          clarification_question?: string | null;
          clarification_resolved?: boolean | null;
          clarification_type?: string | null;
          commitment?: boolean | null;
          commitment_archived_at?: string | null;
          commitment_note?: string | null;
          commitment_started_at?: string | null;
          commitment_until?: string | null;
          completed_at?: string | null;
          cooldown_buffer_minutes?: number | null;
          created_at?: string | null;
          daily_block?: string | null;
          date_confidence?: string | null;
          days_active?: number[] | null;
          drop_id?: string | null;
          end_date?: string | null;
          energy_type?: string | null;
          environment_change?: string | null;
          event_name?: string | null;
          frequency?: string;
          frequency_json?: Json | null;
          has_list?: boolean;
          id?: string;
          is_pinned?: boolean | null;
          is_restart?: boolean | null;
          labels?: Json | null;
          last_checked_in_at?: string | null;
          last_completed_at?: string | null;
          last_reset_date?: string | null;
          linked_event_id?: string | null;
          list_items?: Json | null;
          list_template_id?: string | null;
          locked_in?: boolean;
          locked_in_at?: string | null;
          name: string;
          needs_clarification?: boolean | null;
          notes?: string | null;
          origin?: string | null;
          owner_id: string;
          period_start_at?: string | null;
          period_unit?: string;
          prep_buffer_minutes?: number | null;
          reminders_json?: Json | null;
          replacement_habit_id?: string | null;
          replacement_text?: string | null;
          restart_context?: string | null;
          resurface_count?: number | null;
          scheduled_start_iso?: string | null;
          skipped_in_sweep_at?: string | null;
          source_message_id?: string | null;
          space_id?: string | null;
          stack_offset_minutes?: number | null;
          stack_position?: string | null;
          stack_with_id?: string | null;
          start_date?: string | null;
          start_date_confirmed?: boolean | null;
          subtype?: string;
          tags?: string[] | null;
          tags_meta?: Json | null;
          taper_plan?: Json | null;
          target_count?: number;
          target_per_day?: number | null;
          target_per_period?: number | null;
          time_estimate_minutes?: number | null;
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
          boundary_rule?: string | null;
          buddy_email?: string | null;
          buddy_id?: string | null;
          builder_mode?: string | null;
          cadence?: string;
          canonical_type?: string | null;
          captured_at?: string | null;
          chat_summary?: string | null;
          chat_summary_at?: string | null;
          check_in_after?: number | null;
          check_in_sent?: boolean | null;
          clarification_options?: Json | null;
          clarification_question?: string | null;
          clarification_resolved?: boolean | null;
          clarification_type?: string | null;
          commitment?: boolean | null;
          commitment_archived_at?: string | null;
          commitment_note?: string | null;
          commitment_started_at?: string | null;
          commitment_until?: string | null;
          completed_at?: string | null;
          cooldown_buffer_minutes?: number | null;
          created_at?: string | null;
          daily_block?: string | null;
          date_confidence?: string | null;
          days_active?: number[] | null;
          drop_id?: string | null;
          end_date?: string | null;
          energy_type?: string | null;
          environment_change?: string | null;
          event_name?: string | null;
          frequency?: string;
          frequency_json?: Json | null;
          has_list?: boolean;
          id?: string;
          is_pinned?: boolean | null;
          is_restart?: boolean | null;
          labels?: Json | null;
          last_checked_in_at?: string | null;
          last_completed_at?: string | null;
          last_reset_date?: string | null;
          linked_event_id?: string | null;
          list_items?: Json | null;
          list_template_id?: string | null;
          locked_in?: boolean;
          locked_in_at?: string | null;
          name?: string;
          needs_clarification?: boolean | null;
          notes?: string | null;
          origin?: string | null;
          owner_id?: string;
          period_start_at?: string | null;
          period_unit?: string;
          prep_buffer_minutes?: number | null;
          reminders_json?: Json | null;
          replacement_habit_id?: string | null;
          replacement_text?: string | null;
          restart_context?: string | null;
          resurface_count?: number | null;
          scheduled_start_iso?: string | null;
          skipped_in_sweep_at?: string | null;
          source_message_id?: string | null;
          space_id?: string | null;
          stack_offset_minutes?: number | null;
          stack_position?: string | null;
          stack_with_id?: string | null;
          start_date?: string | null;
          start_date_confirmed?: boolean | null;
          subtype?: string;
          tags?: string[] | null;
          tags_meta?: Json | null;
          taper_plan?: Json | null;
          target_count?: number;
          target_per_day?: number | null;
          target_per_period?: number | null;
          time_estimate_minutes?: number | null;
          time_window?: string;
          title?: string;
          triggers_json?: Json | null;
          updated_at?: string | null;
          views?: Json | null;
          why_string?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'habits_linked_event_id_fkey';
            columns: ['linked_event_id'];
            isOneToOne: false;
            referencedRelation: 'notes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'habits_list_template_fk';
            columns: ['list_template_id'];
            isOneToOne: false;
            referencedRelation: 'list_templates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'habits_space_id_fkey';
            columns: ['space_id'];
            isOneToOne: false;
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
      };
      life_contexts: {
        Row: {
          active: boolean;
          calendar_source: string | null;
          confirmed_at: string | null;
          created_at: string;
          description: string | null;
          end_date: string | null;
          id: string;
          kind: string;
          last_run_id: string | null;
          name: string;
          owner_id: string;
          proposed_at: string | null;
          source: string;
          start_date: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          calendar_source?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          kind: string;
          last_run_id?: string | null;
          name: string;
          owner_id: string;
          proposed_at?: string | null;
          source: string;
          start_date?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          calendar_source?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          kind?: string;
          last_run_id?: string | null;
          name?: string;
          owner_id?: string;
          proposed_at?: string | null;
          source?: string;
          start_date?: string | null;
          updated_at?: string;
        };
        Relationships: [];
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
        Relationships: [
          {
            foreignKeyName: 'lists_space_id_fkey';
            columns: ['space_id'];
            isOneToOne: false;
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
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
          captured_at: string | null;
          chat_summary: string | null;
          chat_summary_at: string | null;
          clarification_options: Json | null;
          clarification_question: string | null;
          clarification_resolved: boolean | null;
          clarification_type: string | null;
          created_at: string | null;
          date: string | null;
          date_confidence: string | null;
          drop_id: string | null;
          end_date: string | null;
          end_time: string | null;
          event_time: string | null;
          external_source: Json | null;
          fmt: string | null;
          has_list: boolean;
          id: string;
          is_all_day: boolean | null;
          is_favorite: boolean | null;
          is_goal: boolean | null;
          is_pinned: boolean | null;
          journal_subtype: string | null;
          labels: Json | null;
          linked_event_id: string | null;
          list_items: Json | null;
          location: string | null;
          mood: string[] | null;
          needs_clarification: boolean | null;
          notification_ids: string[] | null;
          origin: string | null;
          owner_id: string;
          reminder_date: string | null;
          reminder_preferences: Json | null;
          reminders_json: Json | null;
          resurface_at: string | null;
          resurface_count: number | null;
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
          captured_at?: string | null;
          chat_summary?: string | null;
          chat_summary_at?: string | null;
          clarification_options?: Json | null;
          clarification_question?: string | null;
          clarification_resolved?: boolean | null;
          clarification_type?: string | null;
          created_at?: string | null;
          date?: string | null;
          date_confidence?: string | null;
          drop_id?: string | null;
          end_date?: string | null;
          end_time?: string | null;
          event_time?: string | null;
          external_source?: Json | null;
          fmt?: string | null;
          has_list?: boolean;
          id?: string;
          is_all_day?: boolean | null;
          is_favorite?: boolean | null;
          is_goal?: boolean | null;
          is_pinned?: boolean | null;
          journal_subtype?: string | null;
          labels?: Json | null;
          linked_event_id?: string | null;
          list_items?: Json | null;
          location?: string | null;
          mood?: string[] | null;
          needs_clarification?: boolean | null;
          notification_ids?: string[] | null;
          origin?: string | null;
          owner_id: string;
          reminder_date?: string | null;
          reminder_preferences?: Json | null;
          reminders_json?: Json | null;
          resurface_at?: string | null;
          resurface_count?: number | null;
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
          captured_at?: string | null;
          chat_summary?: string | null;
          chat_summary_at?: string | null;
          clarification_options?: Json | null;
          clarification_question?: string | null;
          clarification_resolved?: boolean | null;
          clarification_type?: string | null;
          created_at?: string | null;
          date?: string | null;
          date_confidence?: string | null;
          drop_id?: string | null;
          end_date?: string | null;
          end_time?: string | null;
          event_time?: string | null;
          external_source?: Json | null;
          fmt?: string | null;
          has_list?: boolean;
          id?: string;
          is_all_day?: boolean | null;
          is_favorite?: boolean | null;
          is_goal?: boolean | null;
          is_pinned?: boolean | null;
          journal_subtype?: string | null;
          labels?: Json | null;
          linked_event_id?: string | null;
          list_items?: Json | null;
          location?: string | null;
          mood?: string[] | null;
          needs_clarification?: boolean | null;
          notification_ids?: string[] | null;
          origin?: string | null;
          owner_id?: string;
          reminder_date?: string | null;
          reminder_preferences?: Json | null;
          reminders_json?: Json | null;
          resurface_at?: string | null;
          resurface_count?: number | null;
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
        Relationships: [
          {
            foreignKeyName: 'notes_linked_event_id_fkey';
            columns: ['linked_event_id'];
            isOneToOne: false;
            referencedRelation: 'notes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notes_space_id_fkey';
            columns: ['space_id'];
            isOneToOne: false;
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_preferences: {
        Row: {
          afternoon_enabled: boolean | null;
          afternoon_last_sent: string | null;
          afternoon_time: string | null;
          created_at: string | null;
          evening_enabled: boolean | null;
          evening_last_sent: string | null;
          evening_time: string | null;
          id: string;
          last_app_active_at: string | null;
          morning_enabled: boolean | null;
          morning_last_sent: string | null;
          morning_time: string | null;
          timezone: string | null;
          updated_at: string | null;
          user_id: string | null;
          weekly_day: number | null;
          weekly_enabled: boolean | null;
          weekly_last_sent: string | null;
          weekly_time: string | null;
        };
        Insert: {
          afternoon_enabled?: boolean | null;
          afternoon_last_sent?: string | null;
          afternoon_time?: string | null;
          created_at?: string | null;
          evening_enabled?: boolean | null;
          evening_last_sent?: string | null;
          evening_time?: string | null;
          id?: string;
          last_app_active_at?: string | null;
          morning_enabled?: boolean | null;
          morning_last_sent?: string | null;
          morning_time?: string | null;
          timezone?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
          weekly_day?: number | null;
          weekly_enabled?: boolean | null;
          weekly_last_sent?: string | null;
          weekly_time?: string | null;
        };
        Update: {
          afternoon_enabled?: boolean | null;
          afternoon_last_sent?: string | null;
          afternoon_time?: string | null;
          created_at?: string | null;
          evening_enabled?: boolean | null;
          evening_last_sent?: string | null;
          evening_time?: string | null;
          id?: string;
          last_app_active_at?: string | null;
          morning_enabled?: boolean | null;
          morning_last_sent?: string | null;
          morning_time?: string | null;
          timezone?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
          weekly_day?: number | null;
          weekly_enabled?: boolean | null;
          weekly_last_sent?: string | null;
          weekly_time?: string | null;
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
        Relationships: [
          {
            foreignKeyName: 'people_space_id_fkey';
            columns: ['space_id'];
            isOneToOne: false;
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
      };
      push_tokens: {
        Row: {
          created_at: string | null;
          id: string;
          platform: string;
          token: string;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          platform: string;
          token: string;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          platform?: string;
          token?: string;
          updated_at?: string | null;
          user_id?: string | null;
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
          saveable_json: Json | null;
          space_id: string | null;
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
          saveable_json?: Json | null;
          space_id?: string | null;
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
          saveable_json?: Json | null;
          space_id?: string | null;
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
          auto_title: string | null;
          chat_type: string;
          context_json: Json | null;
          created_at: string | null;
          dismissed_extractions: string[] | null;
          extracted_items: Json | null;
          id: string;
          last_message_snippet: string | null;
          metadata_json: Json | null;
          pinned: boolean | null;
          running_summary: string | null;
          saved_extraction_ids: string[] | null;
          space_id: string | null;
          title: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          auto_title?: string | null;
          chat_type?: string;
          context_json?: Json | null;
          created_at?: string | null;
          dismissed_extractions?: string[] | null;
          extracted_items?: Json | null;
          id?: string;
          last_message_snippet?: string | null;
          metadata_json?: Json | null;
          pinned?: boolean | null;
          running_summary?: string | null;
          saved_extraction_ids?: string[] | null;
          space_id?: string | null;
          title: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          archived_at?: string | null;
          auto_title?: string | null;
          chat_type?: string;
          context_json?: Json | null;
          created_at?: string | null;
          dismissed_extractions?: string[] | null;
          extracted_items?: Json | null;
          id?: string;
          last_message_snippet?: string | null;
          metadata_json?: Json | null;
          pinned?: boolean | null;
          running_summary?: string | null;
          saved_extraction_ids?: string[] | null;
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
      space_meta: {
        Row: {
          created_at: string | null;
          id: string;
          other_context: string | null;
          owner_id: string;
          space_id: string | null;
          success_criteria: string | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          other_context?: string | null;
          owner_id: string;
          space_id?: string | null;
          success_criteria?: string | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          other_context?: string | null;
          owner_id?: string;
          space_id?: string | null;
          success_criteria?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'space_meta_space_id_fkey';
            columns: ['space_id'];
            isOneToOne: true;
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
      };
      space_milestones: {
        Row: {
          completed: boolean | null;
          completed_at: string | null;
          created_at: string | null;
          date: string | null;
          id: string;
          is_active: boolean | null;
          name: string | null;
          note: string | null;
          owner_id: string;
          sort_order: number | null;
          space_id: string | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          completed?: boolean | null;
          completed_at?: string | null;
          created_at?: string | null;
          date?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string | null;
          note?: string | null;
          owner_id: string;
          sort_order?: number | null;
          space_id?: string | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          completed?: boolean | null;
          completed_at?: string | null;
          created_at?: string | null;
          date?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string | null;
          note?: string | null;
          owner_id?: string;
          sort_order?: number | null;
          space_id?: string | null;
          title?: string;
          updated_at?: string | null;
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
      space_suggestions: {
        Row: {
          confidence: number | null;
          created_at: string;
          drop_ids: string[];
          id: string;
          reason: string | null;
          space_id: string | null;
          status: string;
          suggested_name: string | null;
          suggestion_type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          confidence?: number | null;
          created_at?: string;
          drop_ids?: string[];
          id?: string;
          reason?: string | null;
          space_id?: string | null;
          status?: string;
          suggested_name?: string | null;
          suggestion_type: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          confidence?: number | null;
          created_at?: string;
          drop_ids?: string[];
          id?: string;
          reason?: string | null;
          space_id?: string | null;
          status?: string;
          suggested_name?: string | null;
          suggestion_type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'space_suggestions_space_id_fkey';
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
          disable_suggestions: boolean;
          icon: string | null;
          id: string;
          last_summary: string | null;
          last_summary_at: string | null;
          last_summary_tokens: number | null;
          layout_state_json: Json | null;
          mascot_id: string | null;
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
          disable_suggestions?: boolean;
          icon?: string | null;
          id?: string;
          last_summary?: string | null;
          last_summary_at?: string | null;
          last_summary_tokens?: number | null;
          layout_state_json?: Json | null;
          mascot_id?: string | null;
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
          disable_suggestions?: boolean;
          icon?: string | null;
          id?: string;
          last_summary?: string | null;
          last_summary_at?: string | null;
          last_summary_tokens?: number | null;
          layout_state_json?: Json | null;
          mascot_id?: string | null;
          name?: string;
          owner_id?: string;
          summary_cached?: string | null;
          summary_updated_at?: string | null;
          theme?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      synced_calendar_events: {
        Row: {
          archived: boolean;
          archived_at: string | null;
          calendar_id: string | null;
          created_at: string;
          description: string | null;
          end_at: string | null;
          etag: string | null;
          external_id: string;
          id: string;
          is_all_day: boolean | null;
          last_synced_at: string;
          location: string | null;
          owner_id: string;
          provider: string;
          raw: Json | null;
          start_at: string | null;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          archived?: boolean;
          archived_at?: string | null;
          calendar_id?: string | null;
          created_at?: string;
          description?: string | null;
          end_at?: string | null;
          etag?: string | null;
          external_id: string;
          id?: string;
          is_all_day?: boolean | null;
          last_synced_at?: string;
          location?: string | null;
          owner_id: string;
          provider: string;
          raw?: Json | null;
          start_at?: string | null;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          archived?: boolean;
          archived_at?: string | null;
          calendar_id?: string | null;
          created_at?: string;
          description?: string | null;
          end_at?: string | null;
          etag?: string | null;
          external_id?: string;
          id?: string;
          is_all_day?: boolean | null;
          last_synced_at?: string;
          location?: string | null;
          owner_id?: string;
          provider?: string;
          raw?: Json | null;
          start_at?: string | null;
          title?: string | null;
          updated_at?: string;
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
          captured_at: string | null;
          carry_forward: boolean;
          chat_summary: string | null;
          chat_summary_at: string | null;
          clarification_options: Json | null;
          clarification_question: string | null;
          clarification_resolved: boolean | null;
          clarification_type: string | null;
          commitment: boolean | null;
          commitment_archived_at: string | null;
          commitment_note: string | null;
          commitment_started_at: string | null;
          completed_at: string | null;
          cooldown_buffer_minutes: number | null;
          created_at: string | null;
          daily_block: string | null;
          date_confidence: string | null;
          drop_id: string | null;
          due_date: string | null;
          due_day: string | null;
          due_time: string | null;
          duration_minutes: number | null;
          energy_type: string | null;
          has_list: boolean;
          id: string;
          is_pinned: boolean | null;
          labels: Json | null;
          linked_event_id: string | null;
          list_items: Json | null;
          locked_in: boolean;
          locked_in_at: string | null;
          name: string;
          needs_clarification: boolean | null;
          notes: string | null;
          origin: string | null;
          owner_id: string;
          prep_buffer_minutes: number | null;
          priority_kind: string | null;
          priority_kind_source: string | null;
          priority_kind_updated_at: string | null;
          reminders_json: Json | null;
          resurface_at: string | null;
          resurface_count: number | null;
          scheduled_date: string | null;
          scheduled_start_iso: string | null;
          skipped_in_sweep_at: string | null;
          source_message_id: string | null;
          source_note_id: string | null;
          space_id: string | null;
          status: string;
          subtype: string | null;
          sweep_reschedule_count: number;
          tags: Json | null;
          tags_meta: Json | null;
          target_date: string | null;
          time_estimate_minutes: number | null;
          time_window: string | null;
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
          captured_at?: string | null;
          carry_forward?: boolean;
          chat_summary?: string | null;
          chat_summary_at?: string | null;
          clarification_options?: Json | null;
          clarification_question?: string | null;
          clarification_resolved?: boolean | null;
          clarification_type?: string | null;
          commitment?: boolean | null;
          commitment_archived_at?: string | null;
          commitment_note?: string | null;
          commitment_started_at?: string | null;
          completed_at?: string | null;
          cooldown_buffer_minutes?: number | null;
          created_at?: string | null;
          daily_block?: string | null;
          date_confidence?: string | null;
          drop_id?: string | null;
          due_date?: string | null;
          due_day?: string | null;
          due_time?: string | null;
          duration_minutes?: number | null;
          energy_type?: string | null;
          has_list?: boolean;
          id?: string;
          is_pinned?: boolean | null;
          labels?: Json | null;
          linked_event_id?: string | null;
          list_items?: Json | null;
          locked_in?: boolean;
          locked_in_at?: string | null;
          name: string;
          needs_clarification?: boolean | null;
          notes?: string | null;
          origin?: string | null;
          owner_id: string;
          prep_buffer_minutes?: number | null;
          priority_kind?: string | null;
          priority_kind_source?: string | null;
          priority_kind_updated_at?: string | null;
          reminders_json?: Json | null;
          resurface_at?: string | null;
          resurface_count?: number | null;
          scheduled_date?: string | null;
          scheduled_start_iso?: string | null;
          skipped_in_sweep_at?: string | null;
          source_message_id?: string | null;
          source_note_id?: string | null;
          space_id?: string | null;
          status?: string;
          subtype?: string | null;
          sweep_reschedule_count?: number;
          tags?: Json | null;
          tags_meta?: Json | null;
          target_date?: string | null;
          time_estimate_minutes?: number | null;
          time_window?: string | null;
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
          captured_at?: string | null;
          carry_forward?: boolean;
          chat_summary?: string | null;
          chat_summary_at?: string | null;
          clarification_options?: Json | null;
          clarification_question?: string | null;
          clarification_resolved?: boolean | null;
          clarification_type?: string | null;
          commitment?: boolean | null;
          commitment_archived_at?: string | null;
          commitment_note?: string | null;
          commitment_started_at?: string | null;
          completed_at?: string | null;
          cooldown_buffer_minutes?: number | null;
          created_at?: string | null;
          daily_block?: string | null;
          date_confidence?: string | null;
          drop_id?: string | null;
          due_date?: string | null;
          due_day?: string | null;
          due_time?: string | null;
          duration_minutes?: number | null;
          energy_type?: string | null;
          has_list?: boolean;
          id?: string;
          is_pinned?: boolean | null;
          labels?: Json | null;
          linked_event_id?: string | null;
          list_items?: Json | null;
          locked_in?: boolean;
          locked_in_at?: string | null;
          name?: string;
          needs_clarification?: boolean | null;
          notes?: string | null;
          origin?: string | null;
          owner_id?: string;
          prep_buffer_minutes?: number | null;
          priority_kind?: string | null;
          priority_kind_source?: string | null;
          priority_kind_updated_at?: string | null;
          reminders_json?: Json | null;
          resurface_at?: string | null;
          resurface_count?: number | null;
          scheduled_date?: string | null;
          scheduled_start_iso?: string | null;
          skipped_in_sweep_at?: string | null;
          source_message_id?: string | null;
          source_note_id?: string | null;
          space_id?: string | null;
          status?: string;
          subtype?: string | null;
          sweep_reschedule_count?: number;
          tags?: Json | null;
          tags_meta?: Json | null;
          target_date?: string | null;
          time_estimate_minutes?: number | null;
          time_window?: string | null;
          title?: string;
          undefined_due?: boolean | null;
          updated_at?: string | null;
          views?: Json | null;
          why_string?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'todos_linked_event_id_fkey';
            columns: ['linked_event_id'];
            isOneToOne: false;
            referencedRelation: 'notes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'todos_source_note_id_fkey';
            columns: ['source_note_id'];
            isOneToOne: false;
            referencedRelation: 'notes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'todos_space_id_fkey';
            columns: ['space_id'];
            isOneToOne: false;
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
      };
      user_daily_state: {
        Row: {
          created_at: string;
          date: string;
          dco: Json;
          expires_at: string | null;
          extraction_raw: Json | null;
          id: string;
          upcoming_dates: string[] | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          dco: Json;
          expires_at?: string | null;
          extraction_raw?: Json | null;
          id?: string;
          upcoming_dates?: string[] | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          dco?: Json;
          expires_at?: string | null;
          extraction_raw?: Json | null;
          id?: string;
          upcoming_dates?: string[] | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_life_map: {
        Row: {
          id: string;
          last_evidence_date: string | null;
          life_map: Json;
          rebuilt_at: string | null;
          updated_at: string | null;
          user_id: string;
          version: number | null;
        };
        Insert: {
          id?: string;
          last_evidence_date?: string | null;
          life_map: Json;
          rebuilt_at?: string | null;
          updated_at?: string | null;
          user_id: string;
          version?: number | null;
        };
        Update: {
          id?: string;
          last_evidence_date?: string | null;
          life_map?: Json;
          rebuilt_at?: string | null;
          updated_at?: string | null;
          user_id?: string;
          version?: number | null;
        };
        Relationships: [];
      };
      user_profile_overrides: {
        Row: {
          action: string;
          created_at: string | null;
          fact_text: string;
          id: string;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string | null;
          fact_text: string;
          id?: string;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string | null;
          fact_text?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          enable_space_suggestions: boolean;
          generated_at: string | null;
          identity: Json | null;
          model_used: string | null;
          profile_text: string | null;
          relationship_started_at: string | null;
          signals: Json | null;
          timezone: string | null;
          user_id: string;
        };
        Insert: {
          enable_space_suggestions?: boolean;
          generated_at?: string | null;
          identity?: Json | null;
          model_used?: string | null;
          profile_text?: string | null;
          relationship_started_at?: string | null;
          signals?: Json | null;
          timezone?: string | null;
          user_id: string;
        };
        Update: {
          enable_space_suggestions?: boolean;
          generated_at?: string | null;
          identity?: Json | null;
          model_used?: string | null;
          profile_text?: string | null;
          relationship_started_at?: string | null;
          signals?: Json | null;
          timezone?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_rewrite_log: {
        Row: {
          chapter_id: string;
          field_name: string;
          id: string;
          owner_id: string;
          requested_at: string;
        };
        Insert: {
          chapter_id: string;
          field_name: string;
          id?: string;
          owner_id: string;
          requested_at?: string;
        };
        Update: {
          chapter_id?: string;
          field_name?: string;
          id?: string;
          owner_id?: string;
          requested_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_rewrite_log_chapter_id_fkey';
            columns: ['chapter_id'];
            isOneToOne: false;
            referencedRelation: 'chapters';
            referencedColumns: ['id'];
          },
        ];
      };
      user_temporal_anchors: {
        Row: {
          category: string;
          created_at: string | null;
          date_confidence: string;
          date_range_end: string | null;
          date_range_start: string | null;
          date_text: string | null;
          description: string | null;
          id: string;
          resolved_at: string | null;
          resolved_date: string | null;
          source_chat_id: string | null;
          source_message: string | null;
          space_id: string | null;
          status: string | null;
          title: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          category?: string;
          created_at?: string | null;
          date_confidence?: string;
          date_range_end?: string | null;
          date_range_start?: string | null;
          date_text?: string | null;
          description?: string | null;
          id?: string;
          resolved_at?: string | null;
          resolved_date?: string | null;
          source_chat_id?: string | null;
          source_message?: string | null;
          space_id?: string | null;
          status?: string | null;
          title: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          category?: string;
          created_at?: string | null;
          date_confidence?: string;
          date_range_end?: string | null;
          date_range_start?: string | null;
          date_text?: string | null;
          description?: string | null;
          id?: string;
          resolved_at?: string | null;
          resolved_date?: string | null;
          source_chat_id?: string | null;
          source_message?: string | null;
          space_id?: string | null;
          status?: string | null;
          title?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      weekly_summaries: {
        Row: {
          banner_dismissed: boolean | null;
          cleanup_actions: Json | null;
          completed_flow: boolean | null;
          content: Json;
          created_at: string | null;
          generated_at: string;
          id: string;
          key_themes: string[] | null;
          last_viewed_at: string | null;
          moment_dates: string[] | null;
          stats_snapshot: Json;
          trend_context: Json | null;
          updated_at: string | null;
          user_id: string;
          viewed: boolean | null;
          viewed_at: string | null;
          week_end_date: string;
          week_start_date: string;
        };
        Insert: {
          banner_dismissed?: boolean | null;
          cleanup_actions?: Json | null;
          completed_flow?: boolean | null;
          content: Json;
          created_at?: string | null;
          generated_at?: string;
          id?: string;
          key_themes?: string[] | null;
          last_viewed_at?: string | null;
          moment_dates?: string[] | null;
          stats_snapshot: Json;
          trend_context?: Json | null;
          updated_at?: string | null;
          user_id: string;
          viewed?: boolean | null;
          viewed_at?: string | null;
          week_end_date: string;
          week_start_date: string;
        };
        Update: {
          banner_dismissed?: boolean | null;
          cleanup_actions?: Json | null;
          completed_flow?: boolean | null;
          content?: Json;
          created_at?: string | null;
          generated_at?: string;
          id?: string;
          key_themes?: string[] | null;
          last_viewed_at?: string | null;
          moment_dates?: string[] | null;
          stats_snapshot?: Json;
          trend_context?: Json | null;
          updated_at?: string | null;
          user_id?: string;
          viewed?: boolean | null;
          viewed_at?: string | null;
          week_end_date?: string;
          week_start_date?: string;
        };
        Relationships: [];
      };
      world_lineage: {
        Row: {
          child_world_ids: Json;
          confirmed_at: string | null;
          created_at: string;
          drops_reassigned: number | null;
          event_type: string;
          id: string;
          occurred_at: string;
          owner_id: string;
          parent_world_ids: Json;
          proposed_at: string;
          reason: string | null;
          user_edited: boolean;
        };
        Insert: {
          child_world_ids: Json;
          confirmed_at?: string | null;
          created_at?: string;
          drops_reassigned?: number | null;
          event_type: string;
          id?: string;
          occurred_at?: string;
          owner_id: string;
          parent_world_ids: Json;
          proposed_at: string;
          reason?: string | null;
          user_edited?: boolean;
        };
        Update: {
          child_world_ids?: Json;
          confirmed_at?: string | null;
          created_at?: string;
          drops_reassigned?: number | null;
          event_type?: string;
          id?: string;
          occurred_at?: string;
          owner_id?: string;
          parent_world_ids?: Json;
          proposed_at?: string;
          reason?: string | null;
          user_edited?: boolean;
        };
        Relationships: [];
      };
      world_observations: {
        Row: {
          confidence: number | null;
          dismissed_at: string | null;
          generated_at: string;
          generated_by: string;
          id: string;
          kind: string;
          owner_id: string;
          run_id: string | null;
          shown_count: number;
          source_chapter_ids: string[] | null;
          source_drop_ids: string[] | null;
          text: string;
          world_id: string;
        };
        Insert: {
          confidence?: number | null;
          dismissed_at?: string | null;
          generated_at?: string;
          generated_by: string;
          id?: string;
          kind: string;
          owner_id: string;
          run_id?: string | null;
          shown_count?: number;
          source_chapter_ids?: string[] | null;
          source_drop_ids?: string[] | null;
          text: string;
          world_id: string;
        };
        Update: {
          confidence?: number | null;
          dismissed_at?: string | null;
          generated_at?: string;
          generated_by?: string;
          id?: string;
          kind?: string;
          owner_id?: string;
          run_id?: string | null;
          shown_count?: number;
          source_chapter_ids?: string[] | null;
          source_drop_ids?: string[] | null;
          text?: string;
          world_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'world_observations_world_id_fkey';
            columns: ['world_id'];
            isOneToOne: false;
            referencedRelation: 'worlds';
            referencedColumns: ['id'];
          },
        ];
      };
      worlds: {
        Row: {
          archetypes: Json;
          card_subtitle: string | null;
          card_subtitle_source: string | null;
          card_subtitle_updated_at: string | null;
          confidence: number | null;
          confirmed_at: string | null;
          created_at: string;
          description: string | null;
          display_name: string | null;
          first_signal_at: string | null;
          id: string;
          key_priorities: Json | null;
          last_run_id: string | null;
          last_signal_at: string | null;
          life_map_cluster_id: string | null;
          mascot_slug: string | null;
          mascot_slug_source: string | null;
          mascot_slug_updated_at: string | null;
          module_layout: Json | null;
          name: string;
          owner_id: string;
          phase: string;
          proposed_at: string | null;
          signal_velocity: number | null;
          signal_velocity_delta: string | null;
          source: string;
          summary: string | null;
          summary_source: string | null;
          summary_updated_at: string | null;
          updated_at: string;
          visual_style: Json | null;
          world_type: string | null;
          world_type_source: string | null;
          world_type_updated_at: string | null;
        };
        Insert: {
          archetypes?: Json;
          card_subtitle?: string | null;
          card_subtitle_source?: string | null;
          card_subtitle_updated_at?: string | null;
          confidence?: number | null;
          confirmed_at?: string | null;
          created_at?: string;
          description?: string | null;
          display_name?: string | null;
          first_signal_at?: string | null;
          id?: string;
          key_priorities?: Json | null;
          last_run_id?: string | null;
          last_signal_at?: string | null;
          life_map_cluster_id?: string | null;
          mascot_slug?: string | null;
          mascot_slug_source?: string | null;
          mascot_slug_updated_at?: string | null;
          module_layout?: Json | null;
          name: string;
          owner_id: string;
          phase?: string;
          proposed_at?: string | null;
          signal_velocity?: number | null;
          signal_velocity_delta?: string | null;
          source: string;
          summary?: string | null;
          summary_source?: string | null;
          summary_updated_at?: string | null;
          updated_at?: string;
          visual_style?: Json | null;
          world_type?: string | null;
          world_type_source?: string | null;
          world_type_updated_at?: string | null;
        };
        Update: {
          archetypes?: Json;
          card_subtitle?: string | null;
          card_subtitle_source?: string | null;
          card_subtitle_updated_at?: string | null;
          confidence?: number | null;
          confirmed_at?: string | null;
          created_at?: string;
          description?: string | null;
          display_name?: string | null;
          first_signal_at?: string | null;
          id?: string;
          key_priorities?: Json | null;
          last_run_id?: string | null;
          last_signal_at?: string | null;
          life_map_cluster_id?: string | null;
          mascot_slug?: string | null;
          mascot_slug_source?: string | null;
          mascot_slug_updated_at?: string | null;
          module_layout?: Json | null;
          name?: string;
          owner_id?: string;
          phase?: string;
          proposed_at?: string | null;
          signal_velocity?: number | null;
          signal_velocity_delta?: string | null;
          source?: string;
          summary?: string | null;
          summary_source?: string | null;
          summary_updated_at?: string | null;
          updated_at?: string;
          visual_style?: Json | null;
          world_type?: string | null;
          world_type_source?: string | null;
          world_type_updated_at?: string | null;
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
      apply_wandering: {
        Args: { p_owner_id: string };
        Returns: {
          did_wander: boolean;
          new_age: number;
          new_tier: string;
        }[];
      };
      archive_stale_general_chats: { Args: never; Returns: number };
      check_and_age_up_v2: {
        Args: { p_owner_id: string };
        Returns: {
          did_age_up: boolean;
          new_age: number;
          new_tier: string;
        }[];
      };
      check_and_increment_gremly_age: {
        Args: { p_owner_id: string; p_ritual_day: string };
        Returns: {
          did_age_up: boolean;
          new_age: number;
        }[];
      };
      claim_notification_slot: {
        Args: { p_date_key: string; p_type: string; p_user_id: string };
        Returns: boolean;
      };
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
      get_active_users: {
        Args: { since: string };
        Returns: {
          user_id: string;
        }[];
      };
      get_active_users_needing_synthesis: {
        Args: { since?: string };
        Returns: {
          user_id: string;
        }[];
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
      get_or_create_ritual_progress: {
        Args: { p_owner_id: string; p_ritual_day: string };
        Returns: {
          created_at: string | null;
          drops_count: number | null;
          feeding_gauge_value: number | null;
          gauge_breakdown: Json | null;
          is_fed: boolean | null;
          owner_id: string;
          ritual_completed_at: string | null;
          ritual_day: string;
          sweeps_count: number | null;
          updated_at: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'daily_ritual_progress';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_recent_entity_chat_summaries: {
        Args: { p_since: string; p_user_id: string };
        Returns: {
          chat_summary: string;
          chat_summary_at: string;
          entity_id: string;
          entity_title: string;
          entity_type: string;
          space_id: string;
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
      get_training_readiness: {
        Args: { p_owner_id: string; p_since: string };
        Returns: Json;
      };
      get_users_needing_dco: {
        Args: { for_date?: string };
        Returns: {
          timezone: string;
          user_id: string;
        }[];
      };
      increment_drop_count: {
        Args: { p_owner_id: string; p_ritual_day: string };
        Returns: {
          created_at: string | null;
          drops_count: number | null;
          feeding_gauge_value: number | null;
          gauge_breakdown: Json | null;
          is_fed: boolean | null;
          owner_id: string;
          ritual_completed_at: string | null;
          ritual_day: string;
          sweeps_count: number | null;
          updated_at: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'daily_ritual_progress';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      increment_sweep_count: {
        Args: { p_owner_id: string; p_ritual_day: string };
        Returns: {
          created_at: string | null;
          drops_count: number | null;
          feeding_gauge_value: number | null;
          gauge_breakdown: Json | null;
          is_fed: boolean | null;
          owner_id: string;
          ritual_completed_at: string | null;
          ritual_day: string;
          sweeps_count: number | null;
          updated_at: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'daily_ritual_progress';
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      mark_fed_today: {
        Args: { p_owner_id: string; p_ritual_day: string };
        Returns: {
          did_trigger_age_up: boolean;
          new_fed_days_count: number;
        }[];
      };
      period_start: {
        Args: { _cadence: Database['public']['Enums']['cadence_type'] };
        Returns: string;
      };
      set_chat_summary: {
        Args: { p_entity_id: string; p_entity_type: string; p_summary: string };
        Returns: undefined;
      };
      update_feeding_gauge: {
        Args: {
          p_owner_id: string;
          p_ritual_day: string;
          p_source: string;
          p_value: number;
        };
        Returns: {
          new_gauge_value: number;
          new_is_fed: boolean;
        }[];
      };
      update_gauge_atomic: {
        Args: {
          p_owner_id: string;
          p_ritual_day: string;
          p_source: string;
          p_value: number;
        };
        Returns: {
          did_age_up: boolean;
          is_fed: boolean;
          just_fed: boolean;
          new_age: number;
          new_fed_days_count: number;
          new_gauge_value: number;
          new_tier: string;
        }[];
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
