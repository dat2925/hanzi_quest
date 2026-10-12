import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { book1, lesson1a } from "../src/learning/book1";
import { validateBundle } from "../src/learning/schema";
import { gameSnapshotSchema, newGame } from "../src/game-state";
import { initial, canStudy } from "../src/progress";
import {
  finishOperation,
  operation,
  questionKey,
} from "../src/cloud/operations";
import { lessons } from "../src/data";

test("1A has seven stages, three taught words, five independent prompts and stable assessment keys", () => {
  assert.deepEqual(
    book1.lessons[0].screens.map((s) => s.kind),
    [
      "objective",
      "vocabulary",
      "pronunciation",
      "recall",
      "notebook",
      "assessment",
      "srs",
    ],
  );
  assert.equal(book1.lessons.length, 1);
  assert.equal(book1.status, "draft");
  assert.deepEqual(
    lesson1a.words.map((w) => w.hanzi),
    ["你", "好", "你好"],
  );
  assert.equal(lesson1a.questions.length, 5);
  assert.equal(new Set(lesson1a.questions.map(questionKey)).size, 5);
  assert.equal(canStudy(initial, lesson1a, [...lessons, lesson1a]), true);
  const state = newGame(lesson1a, false, lesson1a.questions);
  state.screenIndex = 3;
  state.recallRatings = { "greeting-write": { hanzi: "你好", correct: false } };
  assert.deepEqual(
    gameSnapshotSchema.parse(JSON.parse(JSON.stringify(state))).recallRatings,
    state.recallRatings,
  );
  assert.ok(
    !JSON.stringify(finishOperation(state, 60)).includes("recallRatings"),
  );
  const invalid = structuredClone(book1);
  const recall = invalid.lessons[0].screens.find((s) => s.kind === "recall")!;
  recall.cards[0].knowledge = ["untaught"];
  assert.throws(() => validateBundle(invalid), /chưa dạy/);
  recall.cards[0].knowledge = ["greeting-nihao"];
  recall.cards[4].answer = "nǐ hào";
  assert.throws(() => validateBundle(invalid), /Pinyin/);
  const bad = structuredClone(book1);
  const assessment = bad.lessons[0].screens.find(
    (s) => s.kind === "assessment",
  )!;
  assessment.items[0].question.answer = "missing";
  assert.throws(() => validateBundle(bad));
  assessment.items[0].question.answer = "Xin chào";
  assessment.items[1].id = assessment.items[0].id;
  assert.throws(() => validateBundle(bad), /ID trùng/);
});

test("sample recovery exporter defaults to draft and only publishes with an explicit flag", () => {
  const dir = mkdtempSync(join(tmpdir(), "hanzione-sample-"));
  try {
    for (const published of [false, true]) {
      const output = join(dir, `${published}.sql`);
      execFileSync(process.execPath, [
        "--import",
        "tsx",
        "scripts/export-curriculum.ts",
        "--sample",
        output,
        ...(published ? ["--publish-sample"] : []),
      ]);
      const sql = readFileSync(output, "utf8");
      const course = sql
        .split("\n")
        .find((line) => line.startsWith("insert into public.courses"))!;
      assert.ok(course.includes("coalesce(max(sort_order),-1)+1"));
      assert.ok(course.endsWith(`,${published}) on conflict do nothing;`));
      assert.ok(!sql.includes("do update"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("1A draft and exact promotion preserve ten samples and five users; server grades, review has no XP and retries are safe", async () => {
  const db = new PGlite();
  const dir = mkdtempSync(join(tmpdir(), "hanzione-1a-"));
  const ids = Array.from(
    { length: 5 },
    (_, i) => `20000000-0000-4000-8000-00000000000${i + 1}`,
  );
  const migration = (name: string) =>
    db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  const as = (id: string) =>
    db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  const snapshot = async () =>
    (
      await db.query<{ value: any }>(
        "select public.learning_snapshot() as value",
      )
    ).rows[0].value;
  const apply = (op: unknown) =>
    db.query("select public.apply_learning_operation($1::jsonb)", [
      JSON.stringify(op),
    ]);
  const finish = (lesson = lesson1a) =>
    operation("finish", {
      lessonId: lesson.id,
      seconds: 120,
      endedAt: Date.now(),
      questions: lesson.questions.map((q) => ({
        key: questionKey(q),
        selection: q.answer,
        assisted: false,
      })),
    });
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
    );
    for (const id of ids)
      await db.query("insert into auth.users(id) values($1)", [id]);
    for (const name of [
      "202610120001_schema.sql",
      "202610120002_sample_content.sql",
      "202610120003_legacy_approval.sql",
      "202610120004_learning_structure.sql",
    ])
      await migration(name);
    const before = [];
    for (const id of ids) {
      await as(id);
      await apply(finish(lessons[0]));
      before.push(await snapshot());
    }
    await db.exec("reset role;");
    const samples = (
      await db.query("select id,content_json from public.lessons order by id")
    ).rows;
    const order = (
      await db.query<{ n: number }>(
        "select max(sort_order) n from public.courses",
      )
    ).rows[0].n;
    await migration("202610130001_book1_lesson1a_draft.sql");
    assert.deepEqual(
      (
        await db.query(
          "select id,content_json from public.lessons where id<>'hanzione-b1-l01a' order by id",
        )
      ).rows,
      samples,
    );
    assert.equal(
      (
        await db.query<{ sort_order: number }>(
          "select sort_order from public.courses where id='hanzione-book1-preview'",
        )
      ).rows[0].sort_order,
      order + 1,
    );
    for (const [i, id] of ids.entries()) {
      await as(id);
      assert.deepEqual(await snapshot(), before[i]);
    }
    assert.equal(
      (
        await db.query(
          "select id from public.lessons where id='hanzione-b1-l01a'",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(() => apply(finish()), /UNKNOWN_LESSON/);
    await assert.rejects(
      () => db.query("select * from private.question_bank"),
      /permission denied/,
    );
    const approved = structuredClone(book1);
    approved.status = "published";
    approved.lessons[0].status = "published";
    const input = join(dir, "approved.json"),
      output = join(dir, "publish.sql");
    writeFileSync(input, JSON.stringify(approved));
    execFileSync(process.execPath, [
      "--import",
      "tsx",
      "scripts/import-curriculum.ts",
      input,
      "--promote-sql",
      output,
    ]);
    assert.equal(
      readFileSync(output, "utf8"),
      readFileSync(
        "supabase/manual/book1_lesson1a_publish_after_review.sql",
        "utf8",
      ),
    );
    await db.exec("reset role;");
    await db.exec(readFileSync(output, "utf8"));
    await as(ids[0]);
    const op = finish();
    await apply(op);
    await apply(op);
    const after = await snapshot();
    assert.equal(after.progress.xp, before[0].progress.xp + 40);
    assert.ok(after.progress.completed.includes(lesson1a.id));
    assert.equal(
      after.progress.reviews["你好"].interval,
      Math.max(1, (before[0].progress.reviews["你好"]?.interval || 0) * 2),
    );
    const review = operation("review", { hanzi: "你好", correct: false });
    await apply(review);
    await apply(review);
    const reviewed = await snapshot();
    assert.equal(reviewed.progress.xp, after.progress.xp);
    assert.equal(reviewed.progress.reviews["你好"].interval, 0);
    assert.equal(
      reviewed.progress.reviews["你好"].attempts,
      after.progress.reviews["你好"].attempts + 1,
    );
    assert.ok(reviewed.progress.reviews["你好"].due - Date.now() < 610000);
    await as(ids[1]);
    assert.deepEqual(await snapshot(), before[1]);
    await db.exec("reset role;");
    await assert.rejects(
      () => migration("202610130001_book1_lesson1a_draft.sql"),
      /LESSON_ID_EXISTS/,
    );
    await db.exec("rollback;");
  } finally {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
