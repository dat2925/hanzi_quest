import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { lessons, stages, allWords, installCurriculum } from "../src/data";
import {
  CurriculumError,
  parseCurriculumResponse,
  installCurriculumResponse,
  logCurriculumError,
  safeErrorMessage,
} from "../src/cloud/curriculum-data";
const sample = structuredClone(lessons);
const rows = () =>
  sample.map((lesson, index) => ({
    id: lesson.id,
    content_json: structuredClone(lesson),
    sort_order: index,
    units: { sort_order: 0, courses: { sort_order: 0 } },
  }));
test("all ten actual SQL-seeded samples validate, sort and install without changing progress", async () => {
  const db = new PGlite();
  try {
    // Isolated in-memory fixture only; no connection to deployed Supabase.
    await db.exec(
      `create schema private;create table public.courses(id text primary key,title text,syllabus_version text,sort_order int,is_published bool);create table public.units(id text primary key,course_id text,title text,sort_order int);create table public.lessons(id text primary key,unit_id text,title text,description text,estimated_minutes int,sort_order int,content_json jsonb,is_published bool);create table public.vocabulary(id text primary key,hanzi text,pinyin text,meaning_vi text,syllabus_version text,is_published bool);create table private.question_bank(question_key text primary key,question_json jsonb);`,
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202610120002_sample_content.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const result = await db.query(
      `select l.id,l.content_json,l.sort_order,jsonb_build_object('sort_order',u.sort_order,'courses',jsonb_build_object('sort_order',c.sort_order)) units from public.lessons l join public.units u on u.id=l.unit_id join public.courses c on c.id=u.course_id order by l.sort_order desc`,
    );
    const originalLessons = lessons,
      originalStages = [...stages],
      originalWords = [...allWords];
    try {
      const installed = installCurriculumResponse(result.rows);
      assert.equal(installed.length, 10);
      assert.deepEqual(installed, sample);
      assert.deepEqual(lessons, sample);
      assert.equal(stages.length, 10);
      assert.equal(allWords.length, 27);
    } finally {
      installCurriculum(originalLessons);
      stages.splice(0, stages.length, ...originalStages);
      allWords.splice(0, allWords.length, ...originalWords);
    }
  } finally {
    await db.close();
  }
});
test("safeParse identifies exact lesson and field and never installs partial data", () => {
  const data = rows();
  (data[3].content_json.questions[0] as any).options = null;
  let installed = false;
  assert.throws(
    () =>
      installCurriculumResponse(data, () => {
        installed = true;
      }),
    (e: unknown) =>
      e instanceof CurriculumError &&
      e.issues.some(
        (i) =>
          i.lesson === "strokes" &&
          i.path === "rows.3.content_json.questions.0.options",
      ),
  );
  assert.equal(installed, false);
});
test("nested relation validation precedes sorting; courses/units/order are respected", () => {
  const data = rows();
  (data[1].units as any).courses = null;
  assert.throws(
    () => parseCurriculumResponse(data),
    (e: unknown) =>
      e instanceof CurriculumError &&
      e.issues.some((i) => i.path === "rows.1.units.courses"),
  );
  const order = rows().slice(0, 3);
  order[0].units.courses.sort_order = 1;
  order[1].units.sort_order = 1;
  assert.deepEqual(
    parseCurriculumResponse(order).map((l) => l.id),
    ["tones", "pinyin", "hello"],
  );
});
test("empty response, duplicate and mismatched IDs have actionable diagnostics", () => {
  assert.throws(() => parseCurriculumResponse([]), /mảng không rỗng/);
  const duplicate = rows();
  duplicate.push(duplicate[0]);
  assert.throws(
    () => parseCurriculumResponse(duplicate),
    /ID bài học bị trùng/,
  );
  const mismatch = rows();
  mismatch[0].id = "unexpected";
  assert.throws(() => parseCurriculumResponse(mismatch), /không khớp/);
});
test("install exceptions retain stage and message; safe logs exclude session and credentials", () => {
  assert.throws(
    () =>
      installCurriculumResponse(rows(), () => {
        throw new Error("install fixture failure");
      }),
    (e: unknown) =>
      e instanceof CurriculumError &&
      e.stage === "install" &&
      e.message.includes("install fixture failure"),
  );
  const original = console.error;
  const logs: unknown[][] = [];
  console.error = (...args) => logs.push(args);
  try {
    logCurriculumError(
      Object.assign(
        new Error(
          "Bearer opaque-token-secret; eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.fake-signature token=other-secret",
        ),
        { session: { access_token: "never-log-this" } },
      ),
    );
  } finally {
    console.error = original;
  }
  const output = JSON.stringify(logs);
  assert.ok(!output.includes("opaque-token-secret"));
  assert.ok(!output.includes("eyJ"));
  assert.ok(!output.includes("other-secret"));
  assert.ok(!output.includes("never-log-this"));
  assert.match(
    safeErrorMessage(new Error("__VITE_PRELOAD__ is not defined")),
    /__VITE_PRELOAD__/,
  );
});
