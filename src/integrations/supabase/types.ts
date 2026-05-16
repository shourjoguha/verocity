export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          access_key_hash: string
          created_at: string
          id: number
        }
        Insert: {
          access_key_hash: string
          created_at?: string
          id?: number
        }
        Update: {
          access_key_hash?: string
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      app_users: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      movement_subs: {
        Row: {
          count: number
          created_at: string
          day_key: string
          dismissed_at: string | null
          id: string
          last_used_at: string
          original_movement_id: string
          owner_user_id: string
          plan_id: string
          replacement_movement_id: string
        }
        Insert: {
          count?: number
          created_at?: string
          day_key: string
          dismissed_at?: string | null
          id?: string
          last_used_at?: string
          original_movement_id: string
          owner_user_id: string
          plan_id: string
          replacement_movement_id: string
        }
        Update: {
          count?: number
          created_at?: string
          day_key?: string
          dismissed_at?: string | null
          id?: string
          last_used_at?: string
          original_movement_id?: string
          owner_user_id?: string
          plan_id?: string
          replacement_movement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movement_subs_original_movement_id_fkey"
            columns: ["original_movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_subs_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_subs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_subs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "v_drift_signals"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "movement_subs_replacement_movement_id_fkey"
            columns: ["replacement_movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
        ]
      }
      movements: {
        Row: {
          category: string | null
          created_at: string
          default_metrics: string[]
          default_rest_seconds: number
          id: string
          name: string
          notes: string | null
          owner_user_id: string | null
          primary_metric: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          default_metrics?: string[]
          default_rest_seconds?: number
          id?: string
          name: string
          notes?: string | null
          owner_user_id?: string | null
          primary_metric?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          default_metrics?: string[]
          default_rest_seconds?: number
          id?: string
          name?: string
          notes?: string | null
          owner_user_id?: string | null
          primary_metric?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movements_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          owner_user_id: string
          parsed: Json
          source_markdown: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_user_id: string
          parsed: Json
          source_markdown?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_user_id?: string
          parsed?: Json
          source_markdown?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      plans_bk_20260515: {
        Row: {
          created_at: string | null
          end_date: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          owner_user_id: string | null
          parsed: Json | null
          source_markdown: string | null
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          owner_user_id?: string | null
          parsed?: Json | null
          source_markdown?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          owner_user_id?: string | null
          parsed?: Json | null
          source_markdown?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          acted_at: string | null
          acted_disposition: string | null
          action: string
          block_week: number | null
          body_md: string | null
          confidence: number
          created_at: string
          domain: string
          drift_score: number | null
          goal_ref: string
          id: string
          next_session_id: string | null
          outcome_note: string | null
          owner_user_id: string
          rx_md_path: string
          signals_fired: Json | null
          snooze_count: number
          snoozed_until: string | null
          source_refs: Json | null
          status: string
          subjective_fit_1_5: number | null
          tldr: string
          trigger_type: string
        }
        Insert: {
          acted_at?: string | null
          acted_disposition?: string | null
          action: string
          block_week?: number | null
          body_md?: string | null
          confidence: number
          created_at?: string
          domain?: string
          drift_score?: number | null
          goal_ref: string
          id?: string
          next_session_id?: string | null
          outcome_note?: string | null
          owner_user_id: string
          rx_md_path: string
          signals_fired?: Json | null
          snooze_count?: number
          snoozed_until?: string | null
          source_refs?: Json | null
          status?: string
          subjective_fit_1_5?: number | null
          tldr: string
          trigger_type: string
        }
        Update: {
          acted_at?: string | null
          acted_disposition?: string | null
          action?: string
          block_week?: number | null
          body_md?: string | null
          confidence?: number
          created_at?: string
          domain?: string
          drift_score?: number | null
          goal_ref?: string
          id?: string
          next_session_id?: string | null
          outcome_note?: string | null
          owner_user_id?: string
          rx_md_path?: string
          signals_fired?: Json | null
          snooze_count?: number
          snoozed_until?: string | null
          source_refs?: Json | null
          status?: string
          subjective_fit_1_5?: number | null
          tldr?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_next_session_id_fkey"
            columns: ["next_session_id"]
            isOneToOne: false
            referencedRelation: "v_movement_session_metrics"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "recommendations_next_session_id_fkey"
            columns: ["next_session_id"]
            isOneToOne: false
            referencedRelation: "v_session_metrics"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "recommendations_next_session_id_fkey"
            columns: ["next_session_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations_bk_t_20260516: {
        Row: {
          acted_at: string | null
          acted_disposition: string | null
          action: string | null
          block_week: number | null
          confidence: number | null
          created_at: string | null
          drift_score: number | null
          goal_ref: string | null
          id: string | null
          next_session_id: string | null
          outcome_note: string | null
          owner_user_id: string | null
          rx_md_path: string | null
          signals_fired: Json | null
          snooze_count: number | null
          snoozed_until: string | null
          source_refs: Json | null
          status: string | null
          subjective_fit_1_5: number | null
          tldr: string | null
          trigger_type: string | null
        }
        Insert: {
          acted_at?: string | null
          acted_disposition?: string | null
          action?: string | null
          block_week?: number | null
          confidence?: number | null
          created_at?: string | null
          drift_score?: number | null
          goal_ref?: string | null
          id?: string | null
          next_session_id?: string | null
          outcome_note?: string | null
          owner_user_id?: string | null
          rx_md_path?: string | null
          signals_fired?: Json | null
          snooze_count?: number | null
          snoozed_until?: string | null
          source_refs?: Json | null
          status?: string | null
          subjective_fit_1_5?: number | null
          tldr?: string | null
          trigger_type?: string | null
        }
        Update: {
          acted_at?: string | null
          acted_disposition?: string | null
          action?: string | null
          block_week?: number | null
          confidence?: number | null
          created_at?: string | null
          drift_score?: number | null
          goal_ref?: string | null
          id?: string | null
          next_session_id?: string | null
          outcome_note?: string | null
          owner_user_id?: string | null
          rx_md_path?: string | null
          signals_fired?: Json | null
          snooze_count?: number | null
          snoozed_until?: string | null
          source_refs?: Json | null
          status?: string | null
          subjective_fit_1_5?: number | null
          tldr?: string | null
          trigger_type?: string | null
        }
        Relationships: []
      }
      recommendations_bk_v0_20260515: {
        Row: {
          acted_at: string | null
          action: string | null
          block_week: number | null
          confidence: number | null
          created_at: string | null
          drift_score: number | null
          goal_ref: string | null
          id: string | null
          outcome_note: string | null
          owner_user_id: string | null
          rx_md_path: string | null
          signals_fired: Json | null
          source_refs: Json | null
          status: string | null
          tldr: string | null
          trigger_type: string | null
        }
        Insert: {
          acted_at?: string | null
          action?: string | null
          block_week?: number | null
          confidence?: number | null
          created_at?: string | null
          drift_score?: number | null
          goal_ref?: string | null
          id?: string | null
          outcome_note?: string | null
          owner_user_id?: string | null
          rx_md_path?: string | null
          signals_fired?: Json | null
          source_refs?: Json | null
          status?: string | null
          tldr?: string | null
          trigger_type?: string | null
        }
        Update: {
          acted_at?: string | null
          action?: string | null
          block_week?: number | null
          confidence?: number | null
          created_at?: string | null
          drift_score?: number | null
          goal_ref?: string | null
          id?: string | null
          outcome_note?: string | null
          owner_user_id?: string | null
          rx_md_path?: string | null
          signals_fired?: Json | null
          source_refs?: Json | null
          status?: string | null
          tldr?: string | null
          trigger_type?: string | null
        }
        Relationships: []
      }
      workout_logs: {
        Row: {
          activity_type: string
          avg_hr_bpm: number | null
          created_at: string
          data: Json
          day_key: string | null
          ended_at: string | null
          id: string
          log_date: string
          max_hr_bpm: number | null
          notes: string | null
          owner_user_id: string
          plan_id: string | null
          started_at: string | null
          status: string
          tags: string[]
          total_seconds: number | null
          updated_at: string
          week_number: number | null
        }
        Insert: {
          activity_type?: string
          avg_hr_bpm?: number | null
          created_at?: string
          data?: Json
          day_key?: string | null
          ended_at?: string | null
          id?: string
          log_date?: string
          max_hr_bpm?: number | null
          notes?: string | null
          owner_user_id: string
          plan_id?: string | null
          started_at?: string | null
          status?: string
          tags?: string[]
          total_seconds?: number | null
          updated_at?: string
          week_number?: number | null
        }
        Update: {
          activity_type?: string
          avg_hr_bpm?: number | null
          created_at?: string
          data?: Json
          day_key?: string | null
          ended_at?: string | null
          id?: string
          log_date?: string
          max_hr_bpm?: number | null
          notes?: string | null
          owner_user_id?: string
          plan_id?: string | null
          started_at?: string | null
          status?: string
          tags?: string[]
          total_seconds?: number | null
          updated_at?: string
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "v_drift_signals"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      workout_logs_bk_20260515: {
        Row: {
          activity_type: string | null
          created_at: string | null
          data: Json | null
          day_key: string | null
          ended_at: string | null
          id: string | null
          log_date: string | null
          notes: string | null
          owner_user_id: string | null
          plan_id: string | null
          started_at: string | null
          status: string | null
          tags: string[] | null
          total_seconds: number | null
          updated_at: string | null
          week_number: number | null
        }
        Insert: {
          activity_type?: string | null
          created_at?: string | null
          data?: Json | null
          day_key?: string | null
          ended_at?: string | null
          id?: string | null
          log_date?: string | null
          notes?: string | null
          owner_user_id?: string | null
          plan_id?: string | null
          started_at?: string | null
          status?: string | null
          tags?: string[] | null
          total_seconds?: number | null
          updated_at?: string | null
          week_number?: number | null
        }
        Update: {
          activity_type?: string | null
          created_at?: string | null
          data?: Json | null
          day_key?: string | null
          ended_at?: string | null
          id?: string | null
          log_date?: string | null
          notes?: string | null
          owner_user_id?: string | null
          plan_id?: string | null
          started_at?: string | null
          status?: string | null
          tags?: string[] | null
          total_seconds?: number | null
          updated_at?: string | null
          week_number?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      v_drift_signals: {
        Row: {
          avg_load_drop_pct: number | null
          block_lag_weeks: number | null
          computed_at: string | null
          conditioning_minutes_7d: number | null
          conditioning_target_min: number | null
          drift_breakdown: Json | null
          drift_score: number | null
          facts_json: Json | null
          gap_since_hard_lower_h: number | null
          hard_lower_gap_state: string | null
          last_hard_lower_at: string | null
          last_recovery_or_cardio_at: string | null
          last_workout_at: string | null
          last_workout_day_key: string | null
          owner_user_id: string | null
          pace_ratio_7d: number | null
          plan_block_week: number | null
          plan_end: string | null
          plan_goal: string | null
          plan_id: string | null
          plan_name: string | null
          plan_start: string | null
          recovery_state: string | null
          rolling_2wk_vibe_energy: number | null
          rolling_2wk_vibe_sleep: number | null
          rpe_drift_avg_7d: number | null
          sessions_14d: number | null
          sessions_7d: number | null
          strength_7d: number | null
          target_sessions_per_week: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_movement_session_metrics: {
        Row: {
          avg_rpe: number | null
          day_key: string | null
          has_paused_set: boolean | null
          has_tempo_set: boolean | null
          has_unilateral_set: boolean | null
          is_caution: boolean | null
          is_finisher: boolean | null
          is_main: boolean | null
          log_date: string | null
          movement_category: string | null
          movement_name: string | null
          movement_tags: string[] | null
          owner_user_id: string | null
          paused_sets: number | null
          rpe_drift: number | null
          session_id: string | null
          sets_completed: number | null
          tempo_sets: number | null
          top_set_weight: number | null
          working_sets: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_session_metrics: {
        Row: {
          activity_type: string | null
          avg_actual_rpe: number | null
          completion_rate: number | null
          conditioning_minutes: number | null
          day_key: string | null
          has_paused: boolean | null
          has_tempo: boolean | null
          log_date: string | null
          owner_user_id: string | null
          paused_sets: number | null
          rpe_drift: number | null
          session_id: string | null
          session_minutes: number | null
          sets_abandoned: number | null
          sets_completed: number | null
          sets_logged: number | null
          tempo_sets: number | null
          total_seconds: number | null
          unilateral_sets: number | null
          week_number: number | null
          working_sets: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      bump_movement_sub: {
        Args: {
          p_day_key: string
          p_orig: string
          p_plan: string
          p_repl: string
          p_user: string
        }
        Returns: undefined
      }
      week_for_log: {
        Args: { log_date: string; plan_start: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
