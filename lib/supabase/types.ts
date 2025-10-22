export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.5';
  };
  public: {
    Tables: {
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
      habits: {
        Row: {
          ai_placed: boolean | null;
          buddy_email: string | null;
          buddy_id: string | null;
          completed_at: string | null;
          created_at: string | null;
          end_date: string | null;
          frequency: string;
          frequency_json: Json | null;
          id: string;
          name: string;
          origin: string | null;
          owner_id: string;
          reminders_json: Json | null;
          replacement_habit_id: string | null;
          replacement_text: string | null;
          space_id: string | null;
          stack_offset_minutes: number | null;
          stack_position: string | null;
          stack_with_id: string | null;
          start_date: string | null;
          streak_count: number | null;
          subtype: string;
          taper_plan: Json | null;
          title: string;
          triggers_json: Json | null;
          updated_at: string | null;
          why_string: string | null;
        };
        Insert: {
          ai_placed?: boolean | null;
          buddy_email?: string | null;
          buddy_id?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          end_date?: string | null;
          frequency: string;
          frequency_json?: Json | null;
          id?: string;
          name: string;
          origin?: string | null;
          owner_id?: string;
          reminders_json?: Json | null;
          replacement_habit_id?: string | null;
          replacement_text?: string | null;
          space_id?: string | null;
          stack_offset_minutes?: number | null;
          stack_position?: string | null;
          stack_with_id?: string | null;
          start_date?: string | null;
          streak_count?: number | null;
          subtype?: string;
          taper_plan?: Json | null;
          title: string;
          triggers_json?: Json | null;
          updated_at?: string | null;
          why_string?: string | null;
        };
        Update: {
          ai_placed?: boolean | null;
          buddy_email?: string | null;
          buddy_id?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          end_date?: string | null;
          frequency?: string;
          frequency_json?: Json | null;
          id?: string;
          name?: string;
          origin?: string | null;
          owner_id?: string;
          reminders_json?: Json | null;
          replacement_habit_id?: string | null;
          replacement_text?: string | null;
          space_id?: string | null;
          stack_offset_minutes?: number | null;
          stack_position?: string | null;
          stack_with_id?: string | null;
          start_date?: string | null;
          streak_count?: number | null;
          subtype?: string;
          taper_plan?: Json | null;
          title?: string;
          triggers_json?: Json | null;
          updated_at?: string | null;
          why_string?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'habits_space_id_fkey';
            columns: ['space_id'];
            isOneToOne: false;
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
      };
      notes: {
        Row: {
          ai_placed: boolean | null;
          body: string | null;
          created_at: string | null;
          date: string | null;
          fmt: string | null;
          id: string;
          journal_subtype: string | null;
          mood: string | null;
          origin: string | null;
          owner_id: string;
          reminders_json: Json | null;
          space_id: string | null;
          subtype: string;
          tags: Json | null;
          title: string;
          updated_at: string | null;
          why_string: string | null;
        };
        Insert: {
          ai_placed?: boolean | null;
          body?: string | null;
          created_at?: string | null;
          date?: string | null;
          fmt?: string | null;
          id?: string;
          journal_subtype?: string | null;
          mood?: string | null;
          origin?: string | null;
          owner_id?: string;
          reminders_json?: Json | null;
          space_id?: string | null;
          subtype: string;
          tags?: Json | null;
          title: string;
          updated_at?: string | null;
          why_string?: string | null;
        };
        Update: {
          ai_placed?: boolean | null;
          body?: string | null;
          created_at?: string | null;
          date?: string | null;
          fmt?: string | null;
          id?: string;
          journal_subtype?: string | null;
          mood?: string | null;
          origin?: string | null;
          owner_id?: string;
          reminders_json?: Json | null;
          space_id?: string | null;
          subtype?: string;
          tags?: Json | null;
          title?: string;
          updated_at?: string | null;
          why_string?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notes_space_id_fkey';
            columns: ['space_id'];
            isOneToOne: false;
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
      };
      people: {
        Row: {
          created_at: string | null;
          dates_json: Json | null;
          display_name: string;
          email: string | null;
          id: string;
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
          display_name: string;
          email?: string | null;
          id?: string;
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
          display_name?: string;
          email?: string | null;
          id?: string;
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
          owner_id?: string;
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
          created_at: string | null;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
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
          ai_placed: boolean | null;
          body: string | null;
          completed_at: string | null;
          created_at: string | null;
          due_date: string | null;
          due_time: string | null;
          id: string;
          name: string;
          notes: string | null;
          origin: string | null;
          owner_id: string;
          reminders_json: Json | null;
          space_id: string | null;
          subtype: string | null;
          tags: Json | null;
          undefined_due: boolean | null;
          updated_at: string | null;
          why_string: string | null;
        };
        Insert: {
          ai_placed?: boolean | null;
          body?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          origin?: string | null;
          owner_id?: string;
          reminders_json?: Json | null;
          space_id?: string | null;
          subtype?: string | null;
          tags?: Json | null;
          undefined_due?: boolean | null;
          updated_at?: string | null;
          why_string?: string | null;
        };
        Update: {
          ai_placed?: boolean | null;
          body?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          origin?: string | null;
          owner_id?: string;
          reminders_json?: Json | null;
          space_id?: string | null;
          subtype?: string | null;
          tags?: Json | null;
          undefined_due?: boolean | null;
          updated_at?: string | null;
          why_string?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'todos_space_id_fkey';
            columns: ['space_id'];
            isOneToOne: false;
            referencedRelation: 'spaces';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          created_at: string | null;
          display_name: string | null;
          id: string;
          reduced_motion: boolean | null;
        };
        Insert: {
          created_at?: string | null;
          display_name?: string | null;
          id?: string;
          reduced_motion?: boolean | null;
        };
        Update: {
          created_at?: string | null;
          display_name?: string | null;
          id?: string;
          reduced_motion?: boolean | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
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
