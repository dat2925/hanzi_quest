import { test } from "node:test";
import assert from "node:assert/strict";
import { adminFixture, adminIds, qaBatch } from "./helpers/admin-fixture";
import { prepareBatch } from "../src/admin/batch";
import { lesson1a } from "../src/learning/book1";
import { lesson1b } from "../src/learning/book1b";
import { lesson1c } from "../src/learning/book1c";
import { book1c } from "../src/learning/book1c";
import { lessons, type Lesson } from "../src/data";
import { operation, questionKey } from "../src/cloud/operations";

test("legacy 你好 practice targets are reused unchanged; different answers still block publication atomically", async () => {
  const f = await adminFixture();
  const b = qaBatch(1);
  const vocab = b.lessons[0].screens.find((s) => s.kind === "vocabulary")!;
  vocab.words.push({
    hanzi: "你好",
    pinyin: "nǐ hǎo",
    meaning: "Xin chào",
    tones: [3, 3],
    example: { hanzi: "你好", pinyin: "nǐ hǎo", meaning: "Xin chào" },
  });
  const key = questionKey({
    type: "quiz",
    prompt: "“你好” có nghĩa là gì?",
    audio: "你好",
  });
  const cmd = (data: object) => ({ requestId: crypto.randomUUID(), ...data });
  const ok = async (path: string, data: object) => {
    const r = await f.request(path, cmd(data));
    assert.equal(r.status, 200, JSON.stringify(r.body));
  };
  try {
    const original = (
      await f.db.query<{ question_json: any }>(
        "select question_json from private.question_bank where question_key=$1",
        [key],
      )
    ).rows[0].question_json;
    assert.deepEqual(original.targets, ["你好", "你", "好"]);
    const oldLessons = (
      await f.db.query("select * from public.lessons order by id")
    ).rows;
    await ok("/save", { bundle: b });
    const selection = {
      courseId: b.courseId,
      ids: [b.lessons[0].id],
      expected: { [b.lessons[0].id]: 1 },
    };
    await ok("/review", {
      ...selection,
      sourceChecked: true,
      previewsChecked: true,
    });
    await f.db.exec("reset role;");
    await f.db.query(
      "update private.question_bank set question_json=jsonb_set(question_json,'{answer}','\"Different answer\"') where question_key=$1",
      [key],
    );
    const blocked = await f.request("/publish", cmd(selection));
    assert.match(blocked.body.error, /QUESTION_KEY_CONFLICT/);
    await f.db.exec("reset role;");
    assert.deepEqual(
      (await f.db.query("select * from public.lessons order by id")).rows,
      oldLessons,
    );
    await f.db.query(
      "update private.question_bank set question_json=$2::jsonb where question_key=$1",
      [key, JSON.stringify(original)],
    );
    await ok("/publish", selection);
    await f.db.exec("reset role;");
    assert.deepEqual(
      (
        await f.db.query<{ question_json: unknown }>(
          "select question_json from private.question_bank where question_key=$1",
          [key],
        )
      ).rows[0].question_json,
      original,
    );
    assert.deepEqual(
      (
        await f.db.query(
          "select * from public.lessons where id<>$1 order by id",
          [b.lessons[0].id],
        )
      ).rows,
      oldLessons,
    );
    // The compatibility exception must never apply to an authored assessment.
    const custom = {
      key,
      question: { ...original, contentId: "qa:assessment", targets: ["你好"] },
    };
    assert.equal(
      (
        await f.db.query<{ compatible: boolean }>(
          "select private.curriculum_generated_practice($1::jsonb) compatible",
          [JSON.stringify(custom)],
        )
      ).rows[0].compatible,
      false,
    );
  } finally {
    await f.close();
  }
});

test("admin API + database permissions, five-lesson atomic batch, review revisions, retry, immutable published content and existing progress", async () => {
  const f = await adminFixture();
  const command = (data: object) => ({
    requestId: crypto.randomUUID(),
    ...data,
  });
  const courseId = "hanzione-book1-preview";
  const ok = async (path: string, data?: unknown) => {
    const r = await f.request(path, data);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const snapshot = async (id: string) => {
    await f.as(id);
    return (
      await f.db.query<{ value: any }>(
        "select public.learning_snapshot() value",
      )
    ).rows[0].value;
  };
  const finish = async (l: Lesson) =>
    f.db.query("select public.apply_learning_operation($1::jsonb)", [
      JSON.stringify(
        operation("finish", {
          lessonId: l.id,
          seconds: 120,
          endedAt: Date.now(),
          questions: l.questions.map((q) => ({
            key: questionKey(q),
            selection: q.answer,
            assisted: false,
          })),
        }),
      ),
    ]);
  try {
    for (const id of adminIds) {
      await f.as(id);
      await finish(lessons[0]);
    }
    await f.as(adminIds[0]);
    for (const l of [lesson1a, lesson1b, lesson1c]) await finish(l);
    const before = [];
    for (const id of adminIds) before.push(await snapshot(id));
    await f.db.exec("reset role;");
    const oldLessons = (
      await f.db.query("select * from public.lessons order by id")
    ).rows;
    const oldUnits = (
      await f.db.query("select * from public.units order by id")
    ).rows;
    assert.equal(
      (await f.request("/access", undefined, adminIds[1])).status,
      403,
    );
    assert.equal((await fetch(f.apiUrl + "/api/admin/curriculum")).status, 401);
    await f.as(adminIds[0]);
    await assert.rejects(
      () =>
        f.db.exec(
          "insert into public.curriculum_admins(user_id) values('70000000-0000-4000-8000-000000000002')",
        ),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        f.db.query("select public.curriculum_admin_read($1,$2)", [
          adminIds[0],
          courseId,
        ]),
      /permission denied/,
    );
    await assert.rejects(
      () => f.db.exec("select * from public.curriculum_drafts"),
      /permission denied/,
    );
    await f.as(undefined, true);
    await assert.rejects(
      () =>
        f.db.query("select public.curriculum_admin_read($1,$2)", [
          adminIds[1],
          courseId,
        ]),
      /CURRICULUM_ADMIN_REQUIRED/,
    );
    const catalog = await ok("?course=" + courseId);
    const b = qaBatch();
    const prepared = prepareBatch(b, catalog, "save");
    const placeholder = structuredClone(b);
    placeholder.lessons[0].screens[0].theory = "Điền lý thuyết trước khi hỏi.";
    assert.throws(
      () => prepareBatch(placeholder, catalog, "save"),
      /placeholder/,
    );
    assert.deepEqual(
      prepared.rows.map((r) => r.id),
      [1, 2, 3, 4, 5].map((n) => `qa-book1-next-${n}`),
    );
    const invalid = structuredClone(b);
    invalid.lessons[0].screens.find(
      (s) => s.kind === "vocabulary",
    )!.words[0].pinyin = "invalid123";
    assert.equal(
      (await f.request("/save", command({ bundle: invalid }))).status,
      400,
    );
    const duplicate = structuredClone(b);
    duplicate.lessons.push(duplicate.lessons[0]);
    assert.match(
      (await f.request("/validate", command({ bundle: duplicate }))).body.error,
      /DUPLICATE/,
    );
    const cycle = structuredClone(b);
    cycle.lessons.find((l) => l.id === "qa-book1-next-1")!.prerequisites = [
      "qa-book1-next-5",
    ];
    assert.match(
      (await f.request("/validate", command({ bundle: cycle }))).body.error,
      /vòng lặp/,
    );
    const wrongCourse = structuredClone(b);
    wrongCourse.syllabus.version = "wrong-version";
    assert.match(
      (await f.request("/save", command({ bundle: wrongCourse }))).body.error,
      /COURSE_VERSION_CONFLICT/,
    );
    const validated = await ok("/validate", command({ bundle: b }));
    const save = command({ bundle: validated.bundle });
    const saved = await ok("/save", save);
    assert.deepEqual(await ok("/save", save), saved); // Retry must succeed before rechecking now-existing IDs.
    assert.match(
      (
        await f.request("/save", {
          ...save,
          bundle: { ...validated.bundle, title: "changed" },
        })
      ).body.error,
      /IDEMPOTENCY_CONFLICT/,
    );
    assert.match(
      (await f.request("/save", command({ bundle: b }))).body.error,
      /LESSON_ID_EXISTS/,
    );
    let stored = await ok("?course=" + courseId);
    assert.equal(stored.drafts.length, 5);
    const ids = prepared.rows.map((r) => r.id),
      expected = Object.fromEntries(ids.map((id) => [id, 1]));
    await f.as(adminIds[1]);
    assert.equal(
      (
        await f.db.query(
          "select id from public.lessons where id like 'qa-book1-next-%'",
        )
      ).rows.length,
      0,
    );
    const firstPublish = await f.request(
      "/publish",
      command({ courseId, ids, expected }),
    );
    assert.match(firstPublish.body.error, /REVIEW_REQUIRED/);
    assert.match(
      (await f.request("/review", command({ courseId, ids, expected }))).body
        .error,
      /SOURCE_AND_PREVIEW_REVIEW_REQUIRED/,
    );
    const review = () =>
      ok(
        "/review",
        command({
          courseId,
          ids,
          expected,
          sourceChecked: true,
          previewsChecked: true,
        }),
      );
    await review();
    const edit = structuredClone(b);
    edit.lessons = [edit.lessons.find((l) => l.id === ids[0])!];
    edit.lessons[0].title = "[QA ONLY] Đã sửa nháp";
    await ok("/save", command({ bundle: edit, expected: { [ids[0]]: 1 } }));
    assert.match(
      (
        await f.request(
          "/save",
          command({ bundle: edit, expected: { [ids[0]]: 1 } }),
        )
      ).body.error,
      /DRAFT_REVISION_CONFLICT/,
    );
    expected[ids[0]] = 2;
    assert.match(
      (await f.request("/publish", command({ courseId, ids, expected }))).body
        .error,
      /REVIEW_REQUIRED/,
    );
    stored = await ok("?course=" + courseId);
    assert.equal(
      stored.lessons.filter((l: any) => l.id.startsWith("qa-book1-next-"))
        .length,
      0,
    ); // No partial publish.
    await review();
    const childOnly = await f.request(
      "/publish",
      command({ courseId, ids: [ids[4]], expected: { [ids[4]]: 1 } }),
    );
    assert.match(childOnly.body.error, /prerequisite chưa xuất bản/);
    const publish = command({ courseId, ids: [...ids].reverse(), expected });
    const published = await ok("/publish", publish);
    assert.deepEqual(await ok("/publish", publish), published);
    assert.deepEqual(published.ids, ids);
    const after = await ok("?course=" + courseId);
    assert.equal(
      after.lessons.filter((l: any) => l.is_published && ids.includes(l.id))
        .length,
      5,
    );
    for (const id of adminIds)
      assert.deepEqual(await snapshot(id), before[adminIds.indexOf(id)]);
    await f.db.exec("reset role;");
    assert.deepEqual(
      (
        await f.db.query(
          "select * from public.lessons where id not like 'qa-book1-next-%' order by id",
        )
      ).rows,
      oldLessons,
    );
    assert.deepEqual(
      (await f.db.query("select * from public.units order by id")).rows,
      oldUnits,
    );
    assert.match(
      (
        await f.request(
          "/save",
          command({ bundle: edit, expected: { [ids[0]]: 2 } }),
        )
      ).body.error,
      /IMMUTABLE/,
    );
    await f.as(adminIds[1]);
    const newLesson = after.lessons.find(
      (l: any) => l.id === ids[0],
    ).content_json;
    await assert.rejects(() => finish(newLesson), /LESSON_LOCKED/);
    await f.as(adminIds[0]);
    await finish(newLesson);
    const learned = await snapshot(adminIds[0]);
    assert.equal(learned.progress.xp, before[0].progress.xp + 40);
    assert.ok(learned.progress.completed.includes(ids[0]));
    // A late database guard must roll back the earlier rows and its request receipt.
    const late = prepareBatch(qaBatch(), catalog, "save").rows.slice(0, 2);
    late[0].id = "qa-rollback-only";
    late[0].learning.id = late[0].id;
    late[1].id = lesson1a.id;
    late[1].learning.id = lesson1a.id;
    await f.as(undefined, true);
    await assert.rejects(
      () =>
        f.db.query(
          "select public.curriculum_admin_apply($1,$2,'save',$3,$4::jsonb,'[]'::jsonb)",
          [
            adminIds[0],
            crypto.randomUUID(),
            "a".repeat(64),
            JSON.stringify(late),
          ],
        ),
      /PUBLISHED_OR_LEGACY_IMMUTABLE/,
    );
    await f.db.exec("reset role;");
    assert.equal(
      (
        await f.db.query(
          "select lesson_id from public.curriculum_drafts where lesson_id='qa-rollback-only'",
        )
      ).rows.length,
      0,
    );
    await f.db.exec("reset role;");
    await f.db.query("delete from public.curriculum_admins where user_id=$1", [
      adminIds[0],
    ]);
    assert.equal((await f.request("/access")).status, 403);
  } finally {
    await f.close();
  }
});

test("existing SQL draft 1C can be adopted and edited only without learner references; reviewed own assessment keys may change", async () => {
  const f = await adminFixture({ publish1c: false });
  const b = structuredClone(book1c);
  const item = b.lessons[0].screens.find((s) => s.kind === "assessment")!
    .items[0];
  item.question.hint += " · QA edited hint";
  const id = b.lessons[0].id;
  const cmd = (v: object) => ({ requestId: crypto.randomUUID(), ...v });
  const ok = async (path: string, data: object) => {
    const r = await f.request(path, data);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  try {
    await f.db.query(
      "insert into public.notebook_entries(user_id,lesson_id,content) values($1,$2,'QA learner note')",
      [adminIds[1], id],
    );
    assert.match(
      (await f.request("/save", cmd({ bundle: b, expected: { [id]: 0 } }))).body
        .error,
      /LESSON_HAS_PROGRESS/,
    );
    await f.db.exec("reset role;");
    assert.equal(
      (
        await f.db.query(
          "select content from public.notebook_entries where lesson_id=$1",
          [id],
        )
      ).rows.length,
      1,
    );
    // Remove only the synthetic test note, so the independent adoption scenario has no learner history.
    await f.db.query("delete from public.notebook_entries where lesson_id=$1", [
      id,
    ]);
    const original = (
      await f.db.query("select * from public.lessons where id=$1", [id])
    ).rows;
    await ok("/save", cmd({ bundle: b, expected: { [id]: 0 } }));
    await f.db.exec("reset role;");
    assert.deepEqual(
      (await f.db.query("select * from public.lessons where id=$1", [id])).rows,
      original,
    );
    const selection = {
      courseId: b.courseId,
      ids: [id],
      expected: { [id]: 1 },
    };
    await ok(
      "/review",
      cmd({ ...selection, sourceChecked: true, previewsChecked: true }),
    );
    await ok("/publish", cmd(selection));
    await f.db.exec("reset role;");
    const row = (
      await f.db.query<{ is_published: boolean; content_json: Lesson }>(
        "select is_published,content_json from public.lessons where id=$1",
        [id],
      )
    ).rows[0];
    assert.equal(row.is_published, true);
    assert.match(row.content_json.questions[0].hint!, /QA edited hint/);
  } finally {
    await f.close();
  }
});
