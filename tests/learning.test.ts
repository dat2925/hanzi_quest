import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { beginner, demo } from "../src/learning/demo";
import { validateBundle } from "../src/learning/schema";
import { gameSnapshotSchema, newGame } from "../src/game-state";
import { canStudy, initial } from "../src/progress";
import { lessons as samples } from "../src/data";
import { operation, questionKey } from "../src/cloud/operations";
import { parseCurriculumResponse } from "../src/cloud/curriculum-data";
const clone = () => structuredClone(beginner);
test("demo has nine teaching stages, only two new words and checkpoints keep the screen cursor", () => {
  assert.equal(demo.words.length, 2);
  assert.notEqual(
    questionKey(demo.questions[0]),
    questionKey({
      ...demo.questions[0],
      contentId: "another-lesson:same-prompt",
    }),
  );
  assert.equal(
    questionKey(samples[0].questions[0]),
    JSON.stringify([
      samples[0].questions[0].type,
      samples[0].questions[0].prompt,
      "",
    ]),
  );
  assert.equal(beginner.chapters.length, 8);
  const state = newGame(demo, false, demo.questions);
  state.screenIndex = 5;
  const restored = gameSnapshotSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.screenIndex, 5);
  assert.deepEqual(restored.lesson.learning, demo.learning);
  assert.equal(canStudy(initial, demo, [...samples, demo]), true);
  const next = { ...demo, id: "next-lesson", prerequisites: [demo.id] };
  assert.equal(canStudy(initial, next, [demo, next]), false);
  assert.equal(
    canStudy({ ...initial, completed: [demo.id] }, next, [demo, next]),
    true,
  );
});
test("validator rejects duplicates, invalid answers, untaught words/knowledge, media, Pinyin, tones and prerequisite cycles", () => {
  const mutations: ((b: ReturnType<typeof clone>) => void)[] = [
    (b) => {
      const s = b.lessons[0].screens.find((s) => s.id === "final-tone")!;
      if (s.kind === "exercise") s.question.options[1] = "mā";
    },
    (b) => b.lessons.push(structuredClone(b.lessons[0])),
    (b) => b.lessons[0].screens.push(structuredClone(b.lessons[0].screens[0])),
    (b) => {
      const s = b.lessons[0].screens.find((s) => s.kind === "exercise")!;
      if (s.kind === "exercise") s.question.answer = "bad";
    },
    (b) => {
      const s = b.lessons[0].screens.find((s) => s.kind === "exercise")!;
      if (s.kind === "exercise") s.question.knowledge = ["untaught"];
    },
    (b) => {
      const s = b.lessons[0].screens.find((s) => s.kind === "exercise")!;
      if (s.kind === "exercise") s.question.options[0] = "谢谢";
    },
    (b) => {
      b.lessons[0].screens[0].image = {
        url: "javascript:alert(1)",
        alt: "bad",
      };
    },
    (b) => {
      const s = b.lessons[0].screens.find((s) => s.kind === "vocabulary")!;
      if (s.kind === "vocabulary") s.words[0].pinyin = "xyz";
    },
    (b) => {
      const s = b.lessons[0].screens.find((s) => s.kind === "vocabulary")!;
      if (s.kind === "vocabulary") s.words[0].tones = [4];
    },
    (b) => {
      b.lessons[0].prerequisites = [b.lessons[0].id];
    },
    (b) => {
      b.lessons[0].prerequisites = ["missing-lesson"];
    },
  ];
  for (const mutate of mutations) {
    const b = clone();
    mutate(b);
    assert.throws(() => validateBundle(b));
  }
});
const migrations = [
  "202610120001_schema.sql",
  "202610120002_sample_content.sql",
  "202610120003_legacy_approval.sql",
  "202610120004_learning_structure.sql",
  "202610120005_beginner_demo.sql",
];
test("new migrations preserve five accounts, grade demo, SRS, prerequisite graph, RLS and atomic imports", async () => {
  const db = new PGlite();
  const ids = Array.from(
    { length: 5 },
    (_, i) => `10000000-0000-4000-8000-00000000000${i + 1}`,
  );
  const run = (name: string) =>
    db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  const as = async (id: string) => {
    await db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  };
  const snapshot = async () =>
    (
      await db.query<{ value: any }>(
        "select public.learning_snapshot() as value",
      )
    ).rows[0].value;
  const finish = (l: typeof demo, correct = true) =>
    operation("finish", {
      lessonId: l.id,
      seconds: 120,
      endedAt: Date.now(),
      questions: l.questions.map((q) => ({
        key: questionKey(q),
        selection: correct ? q.answer : "wrong",
        assisted: false,
      })),
    });
  const apply = async (op: unknown) => {
    await db.query("select public.apply_learning_operation($1::jsonb)", [
      JSON.stringify(op),
    ]);
  };
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
    );
    for (const id of ids)
      await db.query("insert into auth.users(id) values($1)", [id]);
    for (const m of migrations.slice(0, 3)) await run(m);
    const before = [];
    for (const [i, id] of ids.entries()) {
      await as(id);
      await apply(operation("profile", { name: `Học viên ${i}` }));
      await apply(finish(samples[0]));
      before.push(await snapshot());
    }
    await db.exec("reset role;");
    const oldContent = await db.query(
      "select id,content_json from public.lessons order by id",
    );
    for (const m of migrations.slice(3)) await run(m);
    const response = await db.query(
      `select l.id,l.content_json,l.sort_order,jsonb_build_object('sort_order',u.sort_order,'courses',jsonb_build_object('sort_order',c.sort_order)) units from public.lessons l join public.units u on u.id=l.unit_id join public.courses c on c.id=u.course_id where c.id='beginner-v1'`,
    );
    assert.equal(parseCurriculumResponse(response.rows)[0].id, demo.id);
    assert.deepEqual(
      (
        await db.query(
          "select id,content_json from public.lessons where id<>'intro-one-two-v1' order by id",
        )
      ).rows,
      oldContent.rows,
    );
    for (const [i, id] of ids.entries()) {
      await as(id);
      assert.deepEqual(await snapshot(), before[i]);
    }
    await as(ids[0]);
    const op = finish(demo);
    await apply(op);
    await apply(op);
    const after = await snapshot();
    assert.equal(after.progress.xp, 80);
    assert.ok(after.progress.completed.includes(demo.id));
    assert.equal(after.progress.reviews["一"].interval, 1);
    assert.equal(after.progress.reviews["二"].attempts, 1);
    await as(ids[1]);
    assert.equal((await snapshot()).progress.xp, 40);
    // Across chapters: required lesson is not the preceding unit position.
    await db.exec("reset role;");
    await db.exec(
      `insert into public.lessons(id,unit_id,title,estimated_minutes,sort_order,content_json,is_published) select 'graph-next','beginner-pinyin','Next',5,0,jsonb_set(content_json,'{id}','"graph-next"'),true from public.lessons where id='intro-one-two-v1';insert into public.lesson_prerequisites values('graph-next','intro-one-two-v1');insert into public.lessons(id,unit_id,title,estimated_minutes,sort_order,content_json,is_published) select 'draft-only','beginner-pinyin','Draft',5,1,jsonb_set(content_json,'{id}','"draft-only"'),false from public.lessons where id='intro-one-two-v1';`,
    );
    await as(ids[1]);
    await assert.rejects(
      () => apply(finish({ ...demo, id: "graph-next" })),
      /LESSON_LOCKED/,
    );
    await assert.rejects(
      () => apply(finish({ ...demo, id: "draft-only" })),
      /UNKNOWN_LESSON/,
    );
    assert.equal(
      (await db.query("select id from public.lessons where id='draft-only'"))
        .rows.length,
      0,
    );
    await apply(finish(demo, false));
    assert.equal((await snapshot()).progress.reviews["一"].interval, 0);
    await assert.rejects(
      () => apply(finish({ ...demo, id: "graph-next" })),
      /LESSON_LOCKED/,
    );
    await apply(finish(demo));
    await apply(finish({ ...demo, id: "graph-next" }));
    assert.ok((await snapshot()).progress.completed.includes("graph-next"));
    await db.exec("reset role;");
    const count = (await db.query("select count(*) n from public.lessons"))
      .rows;
    await assert.rejects(() => run(migrations[4]), /LESSON_ID_EXISTS/);
    await db.exec("rollback;");
    assert.deepEqual(
      (await db.query("select count(*) n from public.lessons")).rows,
      count,
    );
  } finally {
    await db.close();
  }
});
test("draft export and exact-content promotion work without overwriting lessons", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hanzi-import-"));
  const db = new PGlite();
  const cli = (mode: string, out: string) =>
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/import-curriculum.ts",
        "curriculum/beginner.json",
        mode,
        out,
      ],
      { stdio: "pipe" },
    );
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`,
    );
    for (const m of migrations.filter((m) => !m.includes("005")))
      await db.exec(
        readFileSync(
          new URL("../supabase/migrations/" + m, import.meta.url),
          "utf8",
        ),
      );
    const draft = join(dir, "draft.sql"),
      promote = join(dir, "publish.sql");
    cli("--draft-sql", draft);
    cli("--promote-sql", promote);
    await db.exec(readFileSync(draft, "utf8"));
    assert.equal(
      (
        await db.query<{ is_published: boolean }>(
          "select is_published from public.lessons where id='intro-one-two-v1'",
        )
      ).rows[0].is_published,
      false,
    );
    await db.exec(readFileSync(promote, "utf8"));
    assert.equal(
      (
        await db.query<{ is_published: boolean }>(
          "select is_published from public.lessons where id='intro-one-two-v1'",
        )
      ).rows[0].is_published,
      true,
    );
    // Append a lesson that reviews knowledge from an existing published prerequisite.
    const append = clone();
    append.references = append.lessons;
    append.lessons = [
      {
        ...structuredClone(append.lessons[0]),
        id: "append-demo",
        chapterId: "beginner-pinyin",
        prerequisites: [demo.id],
      },
    ];
    const input = join(dir, "append.json"),
      added = join(dir, "append.sql");
    writeFileSync(input, JSON.stringify(append));
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/import-curriculum.ts",
        input,
        "--publish-sql",
        added,
      ],
      { stdio: "pipe" },
    );
    await db.exec(readFileSync(added, "utf8"));
    assert.equal(
      (
        await db.query(
          "select * from public.lesson_prerequisites where lesson_id='append-demo'",
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select * from public.lessons where id='intro-one-two-v1'",
        )
      ).rows.length,
      1,
    );
    await db.query(
      "update public.lessons set content_json=jsonb_set(content_json,'{title}',$1::jsonb) where id='intro-one-two-v1'",
      [JSON.stringify("Changed")],
    );
    await assert.rejects(
      () => db.exec(readFileSync(promote, "utf8")),
      /DRAFT_CONTENT_MISMATCH/,
    );
    await db.exec("rollback;");
    assert.throws(() => cli("--draft-sql", draft));
  } finally {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
