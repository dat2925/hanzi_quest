import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { lessons } from "../src/data";
import { questionKey, operation } from "../src/cloud/operations";
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002";
test("PostgreSQL migrations, real RLS and authenticated RPCs", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users(id) values('${a}'),('${b}');`,
    );
    for (const file of [
      "202610120001_schema.sql",
      "202610120002_sample_content.sql",
      "202610120003_legacy_approval.sql",
    ])
      await db.exec(
        readFileSync(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    async function asUser(id: string) {
      await db.exec(
        `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
      );
    }
    async function apply(op: unknown) {
      await db.query("select public.apply_learning_operation($1::jsonb)", [
        JSON.stringify(op),
      ]);
    }
    async function snapshot() {
      const result = await db.query<{ value: any }>(
        "select public.learning_snapshot() as value",
      );
      return result.rows[0].value;
    }
    await t.test(
      "A and B have separate profiles; direct writes and anonymous RPC denied",
      async () => {
        await asUser(a);
        await apply(operation("profile", { name: "Người A", onboarded: true }));
        assert.equal((await snapshot()).progress.name, "Người A");
        await asUser(b);
        assert.equal((await snapshot()).progress.name, "bạn");
        const rows = await db.query("select * from public.profiles");
        assert.equal(rows.rows.length, 1);
        assert.equal((rows.rows[0] as any).id, b);
        await assert.rejects(
          () =>
            db.exec(
              `update public.profiles set display_name='hack' where id='${a}'`,
            ),
          /permission denied/,
        );
        await assert.rejects(
          () =>
            db.exec(
              `insert into public.user_stats(user_id,total_xp) values('${a}',999999)`,
            ),
          /permission denied/,
        );
        await assert.rejects(
          () => db.exec(`delete from public.profiles where id='${a}'`),
          /permission denied/,
        );
        await assert.rejects(
          () => db.exec(`update public.lessons set content_json='{}'`),
          /permission denied/,
        );
        await db.exec("reset role;set role anon;");
        await assert.rejects(snapshot, /permission denied/);
      },
    );
    const first = lessons[0];
    const finish = operation("finish", {
      lessonId: first.id,
      seconds: 120,
      questions: first.questions.map((q) => ({
        key: questionKey(q),
        selection: q.answer,
        assisted: false,
      })),
      xp: 99999,
      user_id: b,
    });
    await t.test(
      "server grades answers, grants XP once, updates SRS and unlocks",
      async () => {
        await asUser(a);
        await apply(finish);
        await apply(finish);
        const s = await snapshot();
        assert.equal(s.progress.xp, 40);
        assert.deepEqual(s.progress.completed, [first.id]);
        assert.equal(s.progress.history.length, 1);
        assert.ok(s.progress.reviews["你好"]);
        assert.equal(s.progress.reviews["你好"].attempts, 1);
        const rows = await db.query("select * from public.study_sessions");
        assert.equal(rows.rows.length, 1);
        assert.equal((rows.rows[0] as any).user_id, a);
        await asUser(b);
        assert.equal((await snapshot()).progress.xp, 0);
        assert.equal(
          (await db.query("select * from public.study_sessions")).rows.length,
          0,
        );
        await assert.rejects(
          () =>
            db.exec(
              `update public.study_sessions set user_id='${b}' where user_id='${a}'`,
            ),
          /permission denied/,
        );
      },
    );
    await t.test(
      "locked lessons, unknown questions and fake XP rejected",
      async () => {
        await asUser(b);
        await assert.rejects(
          () =>
            apply(
              operation("finish", {
                lessonId: lessons[2].id,
                seconds: 3,
                questions: lessons[2].questions.map((q) => ({
                  key: questionKey(q),
                  selection: q.answer,
                })),
              }),
            ),
          /LESSON_LOCKED/,
        );
        await assert.rejects(
          () =>
            apply(
              operation("finish", {
                lessonId: "practice",
                seconds: 1,
                questions: [{ key: "fake", selection: "fake" }],
              }),
            ),
          /INVALID_QUESTION/,
        );
        const wrong = operation("finish", {
          lessonId: first.id,
          seconds: 10,
          questions: first.questions.map((q) => ({
            key: questionKey(q),
            selection: "wrong",
          })),
          xp: 99999,
        });
        await apply(wrong);
        const s = await snapshot();
        assert.equal(s.progress.xp, 20);
        assert.deepEqual(s.progress.completed, []);
      },
    );
    await t.test(
      "notes detect conflicts and SRS retries are idempotent",
      async () => {
        await asUser(a);
        const note = operation("note", { base: "", value: "Ghi chú A" });
        await apply(note);
        await apply(note);
        await assert.rejects(
          () => apply(operation("note", { base: "", value: "Cũ" })),
          /CONFLICT_NOTE/,
        );
        assert.equal((await snapshot()).progress.notes, "Ghi chú A");
        const review = operation("review", { hanzi: "你好", correct: false });
        await apply(review);
        await apply(review);
        const r = (await snapshot()).progress.reviews["你好"];
        assert.equal(r.attempts, 2);
        assert.equal(r.interval, 0);
        await asUser(b);
        assert.equal((await snapshot()).progress.notes, "");
      },
    );
    await t.test(
      "legacy import never overwrites notes or trusts XP; retry creates one proposal",
      async () => {
        await asUser(a);
        const legacy = operation("legacy", {
          sourceId: "stable-hash",
          data: {
            notes: "Old",
            xp: 999999,
            completed: ["boss"],
            history: [
              {
                date: "2026-10-01",
                minutes: 2,
                xp: 10,
                lesson: "practice",
                accuracy: 1,
              },
            ],
            reviews: {
              谢谢: {
                attempts: 2,
                correct: 2,
                interval: 4,
                due: 1790000000000,
              },
              茶: { attempts: 2, correct: 2, interval: 4, due: 1790000000000 },
            },
            difficult: ["你好"],
            written: ["2026-10-01"],
            daily: 15,
            onboarded: true,
          },
        });
        await apply(legacy);
        await apply(legacy);
        await apply(operation("legacy", { ...(legacy.payload as object) }));
        const s = await snapshot();
        assert.equal(s.progress.notes, "Ghi chú A");
        assert.equal(s.progress.xp, 40);
        assert.ok(s.legacyPending);
        assert.equal(
          (await db.query("select * from public.legacy_imports")).rows.length,
          1,
        );
        await asUser(b);
        assert.equal(
          (await db.query("select * from public.legacy_imports")).rows.length,
          0,
        );
      },
    );
    await t.test(
      "legacy approval is administrator-only, merges history and SRS once",
      async () => {
        await asUser(a);
        const imports = await db.query<{ id: string }>(
          "select id from public.legacy_imports",
        );
        const id = imports.rows[0].id;
        await assert.rejects(
          () => db.query("select public.approve_legacy_import($1::uuid)", [id]),
          /permission denied/,
        );
        await db.exec("reset role;");
        await db.query("select public.approve_legacy_import($1::uuid)", [id]);
        await db.query("select public.approve_legacy_import($1::uuid)", [id]);
        await asUser(a);
        const s = await snapshot();
        assert.equal(s.progress.xp, 50);
        assert.equal(s.progress.history.length, 2);
        assert.equal(s.progress.notes, "Ghi chú A");
        assert.equal(s.progress.reviews["谢谢"].interval, 1);
        assert.equal(s.progress.reviews["茶"].interval, 4);
        assert.ok(s.progress.written.includes("2026-10-01"));
        assert.equal(s.legacyPending, false);
      },
    );
  } finally {
    await db.close();
  }
});
