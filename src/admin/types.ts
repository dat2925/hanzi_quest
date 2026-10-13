import type { Bundle, Learning } from "../learning/schema";
import type { Lesson } from "../data";
export type AdminCourse = {
  id: string;
  title: string;
  syllabus_version: string;
  curriculum_family: "foundation" | "HSK" | "sample";
  hsk_level: number | null;
  is_published: boolean;
  sort_order: number;
};
export type Draft = {
  lesson_id: string;
  course_id: string;
  course_json: { id: string; title: string; syllabus: Bundle["syllabus"] };
  chapter_json: Bundle["chapters"][number];
  learning_json: Learning;
  revision: number;
  reviewed_revision: number | null;
  base_content: unknown;
};
export type AdminCatalog = {
  courses: AdminCourse[];
  chapters: Bundle["chapters"];
  lessons: {
    id: string;
    unit_id: string;
    is_published: boolean;
    content_json: Lesson;
  }[];
  drafts: Draft[];
};
