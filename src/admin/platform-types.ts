// Type-only contract for the admin frontend. Runtime requests remain authenticated HTTP.
export type AdminRole = "learner" | "editor" | "admin";
export type LessonAdminStatus = "draft" | "reviewed" | "published" | "hidden";
export type PageResult<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};
export type AdminAccess = {
  admin: true;
  userId: string;
  role: "admin";
  capabilities: string[];
};
export type AdminOverview = {
  users: number;
  suspendedUsers: number;
  activeUsers7d: number;
  courses: number;
  publishedLessons: number;
  draftLessons: number;
  pendingReview: number;
  studySessions7d: number;
};
export type AdminUserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  display_name: string | null;
  target_hsk: string | null;
  total_xp: number;
  total_study_seconds: number;
  suspended: boolean;
  revision: number;
  role: AdminRole;
  completed_lessons: number;
};
export type AdminUserDetail = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  profile: {
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
  } | null;
  stats: {
    user_id: string;
    total_xp: number;
    current_streak: number;
    longest_streak: number;
    last_study_date: string | null;
    total_study_seconds: number;
    updated_at: string;
  } | null;
  role: AdminRole;
  suspended: boolean;
  reason: string;
  revision: number;
  lessonProgress: {
    lesson_id: string;
    title: string;
    completion_status: "in_progress" | "completed";
    best_score: number;
    attempt_count: number;
    completed_at: string | null;
    updated_at: string;
  }[];
  progressTotal: number;
  limit: number;
  offset: number;
};
export type AdminCourseRow = {
  id: string;
  title: string;
  description: string;
  hsk_level: number | null;
  syllabus_version: string;
  curriculum_family: "sample" | "foundation" | "HSK";
  sort_order: number;
  is_published: boolean;
  admin_revision: number;
  chapters: number;
  lessons: number;
  drafts: number;
};
export type AdminChapterRow = {
  id: string;
  course_id: string;
  title: string;
  description: string;
  sort_order: number;
  admin_revision: number;
};
export type AdminLessonRow = {
  id: string;
  course_id: string;
  chapter_id: string;
  title: string;
  description: string;
  estimated_minutes: number;
  sort_order: number;
  admin_revision: number;
  status: LessonAdminStatus;
  revision: number | null;
  reviewed_revision: number | null;
  learners: number;
};
export type AdminAuditRow = {
  request_id: string;
  actor: string;
  action: string;
  target: string;
  changes: Record<string, unknown>;
  created_at: string;
};
export type AdminCommandResult = {
  requestId: string;
  action: AdminAction;
  id: string;
  revision: number | null;
};
export type AdminAction =
  | "user.update"
  | "user.access"
  | "user.role"
  | "course.save"
  | "chapter.save"
  | "lesson.visibility"
  | "draft.delete";
export type AdminCommandBase = {
  requestId: string;
  id: string;
  expectedRevision: number;
};
export type AdminCommandPayloads = {
  "user.update": AdminCommandBase & {
    displayName: string;
    targetHsk: string;
    dailyGoalMinutes: number;
    profileUpdatedAt: string | null;
  };
  "user.access": AdminCommandBase & { suspended: boolean; reason?: string };
  "user.role": AdminCommandBase & { role: AdminRole };
  "course.save": AdminCommandBase & {
    title: string;
    description?: string;
    sortOrder: number;
    family?: "foundation" | "HSK";
    syllabusVersion?: string;
    hskLevel?: number | null;
  };
  "chapter.save": AdminCommandBase & {
    courseId: string;
    title: string;
    description?: string;
    sortOrder: number;
  };
  "lesson.visibility": AdminCommandBase & { published: boolean };
  "draft.delete": AdminCommandBase;
};
