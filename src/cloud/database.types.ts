import type { Progress } from "../progress";
import type { GameSnapshot } from "../game-state";
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export type Operation = {
  id: string;
  kind:
    | "profile"
    | "note"
    | "review"
    | "difficult"
    | "task"
    | "stage"
    | "finish"
    | "legacy";
  payload: Json;
};
export type Snapshot = {
  progress: Progress;
  stages: GameSnapshot[];
  legacyPending: boolean;
  legacyStatus?: "pending" | "approved" | "rejected" | null;
};
type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
type Owned = { id: string; user_id: string; updated_at: string };
export type Database = {
  public: {
    Tables: {
      profiles: Table<{
        id: string;
        display_name: string;
        avatar_url: string | null;
        target_hsk: string;
        daily_goal_minutes: number;
        preferred_study_time: string;
        onboarding_completed: boolean;
        experience: string;
        dark: boolean;
        sound: boolean;
        created_at: string;
        updated_at: string;
      }>;
      courses: Table<{
        curriculum_family: "sample" | "foundation" | "HSK";
        id: string;
        title: string;
        description: string;
        hsk_level: number | null;
        syllabus_version: string;
        sort_order: number;
        is_published: boolean;
      }>;
      lesson_prerequisites: Table<{
        lesson_id: string;
        requires_lesson_id: string;
      }>;
      units: Table<{
        id: string;
        course_id: string;
        title: string;
        description: string;
        sort_order: number;
      }>;
      lessons: Table<{
        id: string;
        unit_id: string;
        title: string;
        description: string;
        estimated_minutes: number;
        sort_order: number;
        content_json: Json;
        is_published: boolean;
      }>;
      vocabulary: Table<{
        id: string;
        hanzi: string;
        pinyin: string;
        meaning_vi: string;
        examples_json: Json;
        audio_url: string | null;
        hsk_level: number | null;
        syllabus_version: string;
        is_published: boolean;
      }>;
      lesson_progress: Table<
        Owned & {
          lesson_id: string;
          completion_status: string;
          current_stage: number;
          best_score: number;
          attempt_count: number;
          completed_at: string | null;
        }
      >;
      stage_progress: Table<
        Owned & {
          lesson_id: string | null;
          activity_key: string;
          stage_id: string;
          state_json: Json;
          score: number;
          completed_at: string | null;
        }
      >;
      review_items: Table<
        Owned & {
          content_type: string;
          content_id: string;
          repetition_count: number;
          interval_days: number;
          ease_factor: number;
          next_review_at: string;
          last_review_at: string | null;
          correct_count: number;
          difficult: boolean;
        }
      >;
      notebook_entries: Table<
        Owned & {
          lesson_id: string | null;
          title: string;
          content: string;
          created_at: string;
        }
      >;
      notebook_tasks: Table<
        Owned & {
          lesson_id: string | null;
          task_key: string;
          completed: boolean;
        }
      >;
      study_sessions: Table<{
        id: string;
        user_id: string;
        lesson_id: string | null;
        operation_id: string;
        started_at: string;
        ended_at: string;
        duration_seconds: number;
        xp_earned: number;
        score: number;
      }>;
      user_stats: Table<{
        user_id: string;
        total_xp: number;
        current_streak: number;
        longest_streak: number;
        last_study_date: string | null;
        total_study_seconds: number;
        updated_at: string;
      }>;
      sync_operations: Table<{
        user_id: string;
        id: string;
        kind: string;
        created_at: string;
      }>;
      legacy_imports: Table<{
        user_id: string;
        id: string;
        source_id: string;
        data_json: Json;
        status: string;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      learning_snapshot: { Args: Record<string, never>; Returns: Json };
      apply_learning_operation: {
        Args: { p_operation: Json };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
