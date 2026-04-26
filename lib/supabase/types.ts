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
          morning_preview: string | null;
          owner_id: string;
          tone: string | null;
          updated_at: string | null;
        };
        Insert: {
          brevity?: string | null;
          dnd?: Json | null;
          encouragement?: string | null;
          evening_review?: string | null;
          morning_preview?: string | null;
          owner_id: string;
          tone?: string | null;
          updated_at?: string | null;
        };
        Update: {
          brevity?: string | null;
          dnd?: Json | null;
          encouragement?: string | null;
          evening_review?: string | null;
          morning_preview?: string | null;
          owner_id?: string;
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
      habits: {
        Row: {
          ai_placed: boolean;
          buddy_email: string | null;
          buddy_id: string | null;
          completed_at: string | null;
          created_at: string | null;
          end_date: string | null;
          frequency: string;
          frequency_json: Json | null;
          id: string;
          name: string;
          owner_id: string;
          reminders_json: Json | null;
          replacement_habit_id: string | null;
          replacement_text: string | null;
          space_id: string | null;
          stack_offset_minutes: number | null;
          stack_position: string | null;
          stack_with_id: string | null;
          start_date: string | null;
          taper_plan: Json | null;
          time_window: string | null;
          triggers_json: Json | null;
          updated_at: string | null;
        };
        Insert: {
          ai_placed?: boolean;
          buddy_email?: string | null;
          buddy_id?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          end_date?: string | null;
          frequency?: string;
          frequency_json?: Json | null;
          id?: string;
          name: string;
          owner_id: string;
          reminders_json?: Json | null;
          replacement_habit_id?: string | null;
          replacement_text?: string | null;
          space_id?: string | null;
          stack_offset_minutes?: number | null;
          stack_position?: string | null;
          stack_with_id?: string | null;
          start_date?: string | null;
          taper_plan?: Json | null;
          time_window?: string | null;
          triggers_json?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          ai_placed?: boolean;
          buddy_email?: string | null;
          buddy_id?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          end_date?: string | null;
          frequency?: string;
          frequency_json?: Json | null;
          id?: string;
          name?: string;
          owner_id?: string;
          reminders_json?: Json | null;
          replacement_habit_id?: string | null;
          replacement_text?: string | null;
          space_id?: string | null;
          stack_offset_minutes?: number | null;
          stack_position?: string | null;
          stack_with_id?: string | null;
          start_date?: string | null;
          taper_plan?: Json | null;
          time_window?: string | null;
          triggers_json?: Json | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      list_items: {
        Row: {
          created_at: string | null;
          id: string;
          label: string;
          list_id: string;
          meta_json: Json | null;
          qty: number | null;
          unit: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          label: string;
          list_id: string;
          meta_json?: Json | null;
          qty?: number | null;
          unit?: string | null;
        };
        Update: {
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
      notes: {
        Row: {
          ai_placed: boolean;
          body: string | null;
          created_at: string | null;
          date: string | null;
          fmt: string | null;
          id: string;
          journal_subtype: string | null;
          mood: string | null;
          owner_id: string;
          reminders_json: Json | null;
          space_id: string | null;
          subtype: string | null;
          tags: Json | null;
          title: string | null;
          updated_at: string | null;
        };
        Insert: {
          ai_placed?: boolean;
          body?: string | null;
          created_at?: string | null;
          date?: string | null;
          fmt?: string | null;
          id?: string;
          journal_subtype?: string | null;
          mood?: string | null;
          owner_id: string;
          reminders_json?: Json | null;
          space_id?: string | null;
          subtype?: string | null;
          tags?: Json | null;
          title?: string | null;
          updated_at?: string | null;
        };
        Update: {
          ai_placed?: boolean;
          body?: string | null;
          created_at?: string | null;
          date?: string | null;
          fmt?: string | null;
          id?: string;
          journal_subtype?: string | null;
          mood?: string | null;
          owner_id?: string;
          reminders_json?: Json | null;
          space_id?: string | null;
          subtype?: string | null;
          tags?: Json | null;
          title?: string | null;
          updated_at?: string | null;
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
      space_chats: {
        Row: {
          archived_at: string | null;
          created_at: string | null;
          id: string;
          last_message_snippet: string | null;
          metadata_json: Json | null;
          pinned: boolean | null;
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
      spaces: {
        Row: {
          archived_at: string | null;
          created_at: string | null;
          icon: string | null;
          id: string;
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
          icon?: string | null;
          id?: string;
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
          icon?: string | null;
          id?: string;
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
        };
        Insert: {
          created_at?: string | null;
          entity_id: string;
          entity_type: string;
          item_id?: string | null;
          item_type?: string | null;
          owner_id: string;
          tag_id: string;
        };
        Update: {
          created_at?: string | null;
          entity_id?: string;
          entity_type?: string;
          item_id?: string | null;
          item_type?: string | null;
          owner_id?: string;
          tag_id?: string;
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
          created_at: string | null;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      todos: {
        Row: {
          ai_placed: boolean;
          completed_at: string | null;
          created_at: string | null;
          due_date: string | null;
          due_time: string | null;
          id: string;
          name: string;
          notes: string | null;
          owner_id: string;
          reminders_json: Json | null;
          space_id: string | null;
          subtype: string | null;
          sweep_reschedule_count: number | null;
          tags: Json | null;
          time_window: string | null;
          title: string | null;
          undefined_due: boolean | null;
          updated_at: string | null;
        };
        Insert: {
          ai_placed?: boolean;
          completed_at?: string | null;
          created_at?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          owner_id: string;
          reminders_json?: Json | null;
          space_id?: string | null;
          subtype?: string | null;
          sweep_reschedule_count?: number | null;
          tags?: Json | null;
          time_window?: string | null;
          title?: string | null;
          undefined_due?: boolean | null;
          updated_at?: string | null;
        };
        Update: {
          ai_placed?: boolean;
          completed_at?: string | null;
          created_at?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          owner_id?: string;
          reminders_json?: Json | null;
          space_id?: string | null;
          subtype?: string | null;
          sweep_reschedule_count?: number | null;
          tags?: Json | null;
          time_window?: string | null;
          title?: string | null;
          undefined_due?: boolean | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      uuid_generate_v4: { Args: never; Returns: string };
    };
    Enums: {
      [_ in never]: never;
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
    Enums: {},
  },
} as const;

// ============================================================================
// Worlds & Chapters graph (Phase 4)
// ============================================================================

export type WorldPhase = 'candidate' | 'active' | 'evolving' | 'dormant' | 'archived';
export type ChapterPhase = 'suggested' | 'upcoming' | 'active' | 'closed';
export type ChapterType = 'bounded' | 'season' | 'milestone';
export type WorldType = 'project' | 'practice' | 'relationship' | 'domestic';
export type ArcShape = 'outcome' | 'experience' | 'process' | 'commitment';
export type LifeContextKind = 'employer' | 'role' | 'obligation' | 'calendar_source' | 'custom';
export type SignalVelocityDelta = 'growing' | 'stable' | 'declining';
export type AssignedBy = 'classifier' | 'user' | 'migration';
export type DropType = 'note' | 'todo' | 'habit';
export type EntitySource = 'classifier' | 'user' | 'migration';
export type SummarySource = 'classifier' | 'dco' | 'user';

export interface KeyMoment {
  date: string; // ISO date YYYY-MM-DD
  location?: string; // optional label, e.g. 'TOKYO', 'BORA BORA'
  text: string; // e.g. 'Arrived in Tokyo'
  drop_id?: string; // optional back-reference to a drop
}

export interface SlipEvent {
  date: string; // ISO date YYYY-MM-DD
  note?: string; // e.g. "Valentine's — known exception"
  label?: 'exception' | 'lapse' | 'recovery';
}

export interface KeyPriority {
  rank: number;
  text: string;
  kind: 'action' | 'date' | 'blocker' | 'momentum' | 'decision';
  entity_ref?: { id: string; type: 'todo' | 'note' | 'habit' | 'chapter' };
  due_date?: string;
  confidence?: number;
}

export type WorldArchetype =
  | 'creative'
  | 'professional'
  | 'wellness_body'
  | 'wellness_mind'
  | 'relational'
  | 'domestic'
  | 'learning'
  | 'generic';

export interface ArchetypeWeight {
  type: WorldArchetype;
  weight: number;
}

export interface WorldModuleLayoutEntry {
  module: string;
  weight: number;
  config?: unknown;
}

export interface WorldVisualStyle {
  color?: string | null;
}

export interface World {
  id: string;
  owner_id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  archetypes: ArchetypeWeight[];
  phase: WorldPhase;
  source: EntitySource;
  confidence: number | null;
  signal_velocity: string | number | null;
  signal_velocity_delta: SignalVelocityDelta | null;
  first_signal_at: string | null;
  last_signal_at: string | null;
  module_layout: WorldModuleLayoutEntry[] | null;
  visual_style: WorldVisualStyle | null;
  life_map_cluster_id: string | null;
  proposed_at: string | null;
  confirmed_at: string | null;
  last_run_id: string | null;
  created_at: string;
  updated_at: string;
  card_subtitle: string | null;
  summary: string | null;
  key_priorities: KeyPriority[];
  summary_source: SummarySource | null;
  summary_updated_at: string | null;
  card_subtitle_source: SummarySource | null;
  card_subtitle_updated_at: string | null;
  mascot_slug: string | null;
  mascot_slug_source: SummarySource | null;
  mascot_slug_updated_at: string | null;
  // Phase A additions
  world_type: WorldType | null;
  world_type_source: SummarySource | null;
  world_type_updated_at: string | null;
}

export interface Chapter {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  chapter_type: ChapterType;
  phase: ChapterPhase;
  primary_world_id: string | null;
  start_date: string | null;
  end_date: string | null;
  target_description: string | null;
  target_summary: string | null;
  phase_labels: string[] | null;
  current_phase_key: string | null;
  source: EntitySource;
  confidence: number | null;
  proposed_at: string | null;
  confirmed_at: string | null;
  closed_at: string | null;
  last_run_id: string | null;
  created_at: string;
  updated_at: string;
  card_subtitle: string | null;
  summary: string | null;
  key_priorities: KeyPriority[];
  summary_source: SummarySource | null;
  summary_updated_at: string | null;
  card_subtitle_source: SummarySource | null;
  card_subtitle_updated_at: string | null;
  // Phase A additions
  title_source: SummarySource | null;
  title_updated_at: string | null;
  arc_shape: ArcShape | null;
  arc_shape_source: SummarySource | null;
  arc_shape_updated_at: string | null;
  epigraph: string | null;
  epigraph_source: SummarySource | null;
  epigraph_updated_at: string | null;
  epigraph_accepted_at: string | null;
  key_moments: KeyMoment[] | null;
  key_moments_source: SummarySource | null;
  key_moments_updated_at: string | null;
  slip_events: SlipEvent[] | null;
  slip_events_source: SummarySource | null;
  slip_events_updated_at: string | null;
  slip_tracking_enabled: boolean;
  has_blockers_count: number;
  // C.1a — source tracking on remaining structural fields
  start_date_source: string | null;
  start_date_updated_at: string | null;
  end_date_source: string | null;
  end_date_updated_at: string | null;
  current_phase_key_source: string | null;
  current_phase_key_updated_at: string | null;
  target_description_source: string | null;
  target_description_updated_at: string | null;
  phase_labels_source: string | null;
  phase_labels_updated_at: string | null;
  key_priorities_source: string | null;
  key_priorities_updated_at: string | null;
}

export interface LifeContext {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  kind: LifeContextKind;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  source: EntitySource;
  calendar_source: string | null;
  proposed_at: string | null;
  confirmed_at: string | null;
  last_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChapterWorldLink {
  chapter_id: string;
  world_id: string;
  owner_id: string;
  relevance_score: number;
}

export interface DropWorldLink {
  drop_id: string;
  drop_type: DropType;
  world_id: string;
  owner_id: string;
  relevance_score: number;
  assigned_by: AssignedBy;
  reason: string | null;
  created_at: string;
  last_confirmed_at: string | null;
}

export interface DropChapterLink {
  drop_id: string;
  drop_type: DropType;
  chapter_id: string;
  owner_id: string;
  relevance_score: number;
  assigned_by: AssignedBy;
  reason: string | null;
  created_at: string;
  last_confirmed_at: string | null;
}

export interface DropContextLink {
  drop_id: string;
  drop_type: DropType;
  context_id: string;
  owner_id: string;
  relevance_score: number;
  assigned_by: AssignedBy;
  reason: string | null;
  created_at: string;
  last_confirmed_at: string | null;
}

export type WorldObservationKind = 'pattern' | 'cross_reference' | 'trajectory' | 'risk';
export type WorldObservationGeneratedBy = 'observation_generator' | 'user_request' | 'classifier';

export interface WorldObservation {
  id: string;
  owner_id: string;
  world_id: string;
  text: string;
  kind: WorldObservationKind;
  source_drop_ids: string[];
  source_chapter_ids: string[];
  confidence: number | null;
  generated_at: string;
  dismissed_at: string | null;
  shown_count: number;
  generated_by: WorldObservationGeneratedBy;
  run_id: string | null;
}
