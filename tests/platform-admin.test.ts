import { test } from "node:test";
import assert from "node:assert/strict";
import { adminFixture, adminIds, qaBatch } from "./helpers/admin-fixture";

test("platform admin HTTP + database: role isolation, searchable users, profile CAS, suspension of existing sessions, audit and replay", async () => {
  const f = await adminFixture({ platform: true });
  const userId = adminIds[1];
  const command = (data: object) => ({
    requestId: crypto.randomUUID(),
    ...data,
  });
  const ok = async (path: string, payload?: object) => {
    const r = await f.platformRequest(path, { payload });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  try {
    assert.equal(
      (await f.platformRequest("/users", { actor: null })).status,
      401,
    );
    assert.equal(
      (await f.platformRequest("/users", { actor: userId })).status,
      403,
    );
    assert.equal(
      (await f.platformRequest("/users", { origin: "https://other.example" }))
        .status,
      403,
    );
    assert.equal((await f.platformRequest("/users?limit=101")).status, 400);
    assert.equal((await f.platformRequest("/users?unknown=1")).status, 400);
    assert.equal((await f.platformRequest("/unknown")).status, 404);
    assert.equal(
      (await f.platformRequest("/users", { method: "DELETE" })).status,
      405,
    );
    const access = await ok("/access");
    assert.equal(access.role, "admin");
    const overview = await ok("/overview");
    assert.equal(overview.users, 5);
    const users = await ok("/users?search=user2%40example&limit=1");
    assert.equal(users.total, 1);
    assert.equal(users.items[0].id, userId);
    assert.equal((await ok("/users?search=%25")).total, 0); // Search is literal, not an ILIKE wildcard.
    assert.equal((await ok("/users?offset=5")).items.length, 0);
    const detail = await ok(`/users/${userId}`);
    assert.equal(detail.profile, null);
    assert.ok(!JSON.stringify(detail).includes("raw_user_meta_data"));
    const change = command({
      id: userId,
      expectedRevision: 0,
      profileUpdatedAt: null,
      displayName: "Học viên thử",
      targetHsk: "HSK 2",
      dailyGoalMinutes: 25,
    });
    const saved = await ok("/commands/user.update", change);
    assert.equal(saved.revision, 1);
    assert.deepEqual(await ok("/commands/user.update", change), saved);
    assert.equal(
      (
        await f.platformRequest("/commands/user.update", {
          payload: { ...change, displayName: "Khác" },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await f.platformRequest("/commands/user.update", {
          payload: command({ ...change, requestId: crypto.randomUUID() }),
        })
      ).status,
      409,
    );
    const updated = await ok(`/users/${userId}`);
    assert.equal(updated.profile.display_name, "Học viên thử");
    const staleProfile = await f.platformRequest("/commands/user.update", {
      payload: command({
        id: userId,
        expectedRevision: 1,
        profileUpdatedAt: null,
        displayName: "Stale",
        targetHsk: "HSK 1",
        dailyGoalMinutes: 15,
      }),
    });
    assert.equal(staleProfile.status, 409);
    assert.match(staleProfile.body.error, /PROFILE_CHANGED/);
    assert.equal(
      (
        await f.platformRequest("/commands/user.role", {
          payload: command({
            id: adminIds[0],
            expectedRevision: 0,
            role: "learner",
          }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.platformRequest("/commands/user.access", {
          payload: command({
            id: adminIds[0],
            expectedRevision: 0,
            suspended: true,
            reason: "self",
          }),
        })
      ).status,
      400,
    );
    await ok(
      "/commands/user.role",
      command({ id: userId, expectedRevision: 1, role: "editor" }),
    );
    assert.equal((await f.request("/access", undefined, userId)).status, 200);
    assert.equal(
      (await f.platformRequest("/users", { actor: userId })).status,
      403,
    );
    await ok(
      "/commands/user.access",
      command({
        id: userId,
        expectedRevision: 2,
        suspended: true,
        reason: "Tạm khóa kiểm thử",
      }),
    );
    assert.equal((await ok("/users?status=suspended")).total, 1);
    assert.equal((await f.request("/access", undefined, userId)).status, 403);
    await f.as(userId);
    assert.equal(
      (await f.db.query("select * from public.courses")).rows.length,
      0,
    );
    await assert.rejects(
      f.db.query("select public.learning_snapshot()"),
      /ACCOUNT_SUSPENDED/,
    );
    await assert.rejects(
      f.db.query("select public.apply_learning_operation($1::jsonb)", [
        JSON.stringify({
          id: crypto.randomUUID(),
          kind: "profile",
          payload: { name: "Bypass" },
        }),
      ]),
      /ACCOUNT_SUSPENDED/,
    );
    await assert.rejects(
      f.db.query("select public.platform_admin_read($1,'users','{}')", [
        adminIds[0],
      ]),
      /permission denied/,
    );
    await assert.rejects(
      f.db.query("select * from public.admin_audit"),
      /permission denied/,
    );
    await ok(
      "/commands/user.access",
      command({ id: userId, expectedRevision: 3, suspended: false }),
    );
    await f.as(userId);
    assert.ok(
      (await f.db.query("select * from public.courses")).rows.length > 0,
    );
    await f.db.query("select public.learning_snapshot()");
    await ok(
      "/commands/user.role",
      command({ id: userId, expectedRevision: 4, role: "admin" }),
    );
    assert.equal(
      (await f.platformRequest("/access", { actor: userId })).status,
      200,
    );
    assert.equal((await f.request("/access", undefined, userId)).status, 200);
    const cannotSuspendAdmin = await f.platformRequest(
      "/commands/user.access",
      {
        payload: command({
          id: userId,
          expectedRevision: 5,
          suspended: true,
          reason: "test",
        }),
      },
    );
    assert.match(
      cannotSuspendAdmin.body.error,
      /DEMOTE_ADMIN_BEFORE_SUSPENDING/,
    );
    await ok(
      "/commands/user.role",
      command({ id: userId, expectedRevision: 5, role: "learner" }),
    );
    assert.equal(
      (await f.platformRequest("/access", { actor: userId })).status,
      403,
    );
    assert.equal((await f.request("/access", undefined, userId)).status, 403);
    const audit = await ok("/audit?search=user.role");
    assert.equal(audit.total, 3);
    assert.ok(audit.items.every((item: any) => item.actor === adminIds[0]));
    await f.as(adminIds[2]);
    await assert.rejects(
      f.db.query(
        "select public.platform_admin_apply($1,$2,'user.role',$3,$4::jsonb)",
        [
          adminIds[0],
          crypto.randomUUID(),
          "a".repeat(64),
          JSON.stringify({ id: userId, expectedRevision: 6, role: "admin" }),
        ],
      ),
      /permission denied/,
    );
    await f.as(undefined, true);
    await assert.rejects(
      f.db.query("select public.platform_admin_read($1,'users','{}')", [
        userId,
      ]),
      /PLATFORM_ADMIN_REQUIRED/,
    );
  } finally {
    await f.close();
  }
});

test("platform admin content management preserves published data, respects dependencies, and keeps editorial publishing usable", async () => {
  const f = await adminFixture({ platform: true, publish1c: false });
  const command = (data: object) => ({
    requestId: crypto.randomUUID(),
    ...data,
  });
  const ok = async (path: string, payload?: object) => {
    const r = await f.platformRequest(path, { payload });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  try {
    await f.db.exec("reset role;");
    const before = (
      await f.db.query("select id,content_json from public.lessons order by id")
    ).rows;
    const course = {
      id: "qa-platform-course",
      expectedRevision: 0,
      title: "Khóa mới",
      description: "Mô tả",
      sortOrder: 10,
      family: "foundation",
      syllabusVersion: "qa-v1",
      hskLevel: null,
    };
    await ok("/commands/course.save", command(course));
    const found = await ok("/courses?search=qa-platform");
    assert.equal(found.items[0].admin_revision, 1);
    assert.equal(found.items[0].is_published, false);
    await ok(
      "/commands/course.save",
      command({
        id: course.id,
        expectedRevision: 1,
        title: "Đã sửa",
        description: "",
        sortOrder: 11,
      }),
    );
    assert.equal(
      (
        await f.platformRequest("/commands/course.save", {
          payload: command(course),
        })
      ).status,
      409,
    );
    const immutableVersion = await f.platformRequest("/commands/course.save", {
      payload: command({
        ...course,
        expectedRevision: 2,
        syllabusVersion: "changed-v2",
      }),
    });
    assert.match(immutableVersion.body.error, /COURSE_VERSION_IMMUTABLE/);
    await ok(
      "/commands/chapter.save",
      command({
        id: "qa-platform-chapter",
        courseId: course.id,
        title: "Chương mới",
        sortOrder: 0,
        expectedRevision: 0,
      }),
    );
    const chapters = await ok(`/chapters?courseId=${course.id}`);
    assert.equal(chapters.items.length, 1);
    const duplicateOrder = await f.platformRequest("/commands/chapter.save", {
      payload: command({
        id: "qa-platform-chapter-duplicate",
        courseId: course.id,
        title: "Trùng thứ tự",
        sortOrder: 0,
        expectedRevision: 0,
      }),
    });
    assert.equal(duplicateOrder.status, 400);
    assert.equal((await ok(`/chapters?courseId=${course.id}`)).total, 1);
    const sqlDraft = await ok("/lessons?status=draft");
    assert.ok(sqlDraft.items.some((x: any) => x.id === "hanzione-b1-l01c"));
    const bypass = await f.platformRequest("/commands/lesson.visibility", {
      payload: command({
        id: "hanzione-b1-l01c",
        expectedRevision: 0,
        published: true,
      }),
    });
    assert.match(bypass.body.error, /USE_REVIEW_PUBLISH_WORKFLOW/);
    const blocked = await f.platformRequest("/commands/lesson.visibility", {
      payload: command({
        id: "hanzione-b1-l01a",
        expectedRevision: 0,
        published: false,
      }),
    });
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error, /PUBLISHED_DEPENDENTS_EXIST/);
    const hide = command({
      id: "hanzione-b1-l01b",
      expectedRevision: 0,
      published: false,
    });
    const hidden = await ok("/commands/lesson.visibility", hide);
    assert.deepEqual(await ok("/commands/lesson.visibility", hide), hidden);
    assert.ok(
      (await ok("/lessons?status=hidden")).items.some(
        (x: any) => x.id === "hanzione-b1-l01b",
      ),
    );
    await f.db.exec("reset role;");
    await assert.rejects(
      f.db.query(
        "update public.lessons set content_json=jsonb_set(content_json,'{description}','\"rewrite\"') where id='hanzione-b1-l01b'",
      ),
      /PUBLISHED_CONTENT_IMMUTABLE/,
    );
    await ok(
      "/commands/lesson.visibility",
      command({
        id: "hanzione-b1-l01a",
        expectedRevision: 0,
        published: false,
      }),
    );
    const missingPrerequisite = await f.platformRequest(
      "/commands/lesson.visibility",
      {
        payload: command({
          id: "hanzione-b1-l01b",
          expectedRevision: 1,
          published: true,
        }),
      },
    );
    assert.match(missingPrerequisite.body.error, /PREREQUISITE_NOT_PUBLISHED/);
    await ok(
      "/commands/lesson.visibility",
      command({ id: "hanzione-b1-l01a", expectedRevision: 1, published: true }),
    );
    await ok(
      "/commands/lesson.visibility",
      command({ id: "hanzione-b1-l01b", expectedRevision: 1, published: true }),
    );
    await f.db.exec("reset role;");
    assert.deepEqual(
      (
        await f.db.query(
          "select id,content_json from public.lessons order by id",
        )
      ).rows,
      before,
    );
    // The migration wraps learning RPCs without changing completion/XP behavior.
    await f.as(adminIds[1]);
    await f.db.query("select public.learning_snapshot()");
    await f.db.query("select public.apply_learning_operation($1::jsonb)", [
      JSON.stringify({
        id: crypto.randomUUID(),
        kind: "profile",
        payload: { name: "Sau migration" },
      }),
    ]);
    const batch = qaBatch(2);
    batch.lessons = batch.lessons.map((l) => ({
      ...l,
      prerequisites: l.id.endsWith("1")
        ? ["hanzione-b1-l01b"]
        : ["qa-book1-next-1"],
    }));
    const save = await f.request("/save", command({ bundle: batch }));
    assert.equal(save.status, 200, JSON.stringify(save.body));
    const blockedDelete = await f.platformRequest("/commands/draft.delete", {
      payload: command({ id: "qa-book1-next-1", expectedRevision: 1 }),
    });
    assert.equal(blockedDelete.status, 409);
    await ok(
      "/commands/draft.delete",
      command({ id: "qa-book1-next-2", expectedRevision: 1 }),
    );
    const selection = {
      courseId: batch.courseId,
      ids: ["qa-book1-next-1"],
      expected: { "qa-book1-next-1": 1 },
    };
    const review = await f.request(
      "/review",
      command({ ...selection, sourceChecked: true, previewsChecked: true }),
    );
    assert.equal(review.status, 200, JSON.stringify(review.body));
    assert.equal((await f.request("/publish", command(selection))).status, 200);
    const editorialAudit = await ok("/audit?search=curriculum.");
    assert.equal(editorialAudit.total, 3);
    assert.deepEqual(
      new Set(editorialAudit.items.map((x: any) => x.action)),
      new Set(["curriculum.save", "curriculum.review", "curriculum.publish"]),
    );
    assert.ok(
      (await ok("/lessons?status=published")).items.some(
        (x: any) => x.id === "qa-book1-next-1",
      ),
    );
    const cannotDelete = await f.platformRequest("/commands/draft.delete", {
      payload: command({ id: "qa-book1-next-1", expectedRevision: 1 }),
    });
    assert.match(cannotDelete.body.error, /EXISTING_LESSON_CANNOT_DELETE/);
  } finally {
    await f.close();
  }
});
