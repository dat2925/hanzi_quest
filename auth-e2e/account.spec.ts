import { test, expect, type BrowserContext } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beginner } from "../src/learning/demo";
import { lesson1a } from "../src/learning/book1";
const ids = {
  a: "20000000-0000-4000-8000-000000000001",
  b: "20000000-0000-4000-8000-000000000002",
};
test("mock Auth + PostgreSQL RPC: signup/login, checkpoint, devices, offline note, isolation, reset", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const db = new PGlite();
  const contexts: BrowserContext[] = [];
  let locked = Promise.resolve();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`,
  );
  for (const f of [
    "202610120001_schema.sql",
    "202610120002_sample_content.sql",
    "202610120003_legacy_approval.sql",
    "202610120004_learning_structure.sql",
    "202610120005_beginner_demo.sql",
    "202610130001_book1_lesson1a_draft.sql",
  ])
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + f, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    readFileSync(
      "supabase/manual/book1_lesson1a_publish_after_review.sql",
      "utf8",
    ),
  );
  const curriculumRows = (
    await db.query<any>(
      `select l.id,l.unit_id,l.content_json,l.sort_order,u.course_id,jsonb_build_object('sort_order',u.sort_order,'courses',jsonb_build_object('sort_order',c.sort_order)) units from public.lessons l join public.units u on u.id=l.unit_id join public.courses c on c.id=u.course_id where l.is_published`,
    )
  ).rows;
  const courseRows = (
    await db.query(
      `select id,title,syllabus_version from public.courses where is_published`,
    )
  ).rows;
  const chapterRows = (
    await db.query<any>(
      `select id,title,description,course_id from public.units`,
    )
  ).rows;
  const user = (id: string) => ({
    id,
    aud: "authenticated",
    role: "authenticated",
    email: id === ids.a ? "a@example.test" : "b@example.test",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  });
  const token = (id: string) =>
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ) +
    "." +
    Buffer.from(
      JSON.stringify({
        sub: id,
        role: "authenticated",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url") +
    ".test-signature";
  async function setup(width = 1440) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    contexts.push(ctx);
    await ctx.route("https://hanzi-qa.supabase.co/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        body = req.postDataJSON() || {};
      const auth = req.headers().authorization;
      const id = auth?.startsWith("Bearer ey")
        ? JSON.parse(
            Buffer.from(auth.slice(7).split(".")[1], "base64url").toString(),
          ).sub
        : null;
      const fulfill = (data: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(data),
          headers: { "access-control-allow-origin": "*" },
        });
      if (url.pathname.endsWith("/signup")) {
        const uid = body.email.startsWith("a") ? ids.a : ids.b;
        await db.exec("reset role;");
        await db.query(
          "insert into auth.users(id,raw_user_meta_data) values($1,$2) on conflict do nothing",
          [uid, JSON.stringify(body.data || {})],
        );
        return fulfill({ user: user(uid), session: null });
      }
      if (url.pathname.endsWith("/token")) {
        const uid = body.email?.startsWith("a") ? ids.a : ids.b;
        if (body.password === "wrong")
          return fulfill({ msg: "Invalid login credentials" }, 400);
        return fulfill({
          access_token: token(uid),
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "mock-refresh-" + uid,
          user: user(uid),
        });
      }
      if (url.pathname.endsWith("/logout") || url.pathname.endsWith("/recover"))
        return fulfill({});
      if (url.pathname.endsWith("/user")) return fulfill(user(id || ids.a));
      if (url.pathname === "/rest/v1/courses") return fulfill(courseRows);
      if (url.pathname === "/rest/v1/units")
        return fulfill(
          chapterRows.filter(
            (c) => "eq." + c.course_id === url.searchParams.get("course_id"),
          ),
        );
      if (url.pathname === "/rest/v1/lessons")
        return fulfill(
          curriculumRows.filter(
            (l) =>
              "eq." + l.course_id === url.searchParams.get("units.course_id") &&
              (!url.searchParams.has("unit_id") ||
                "eq." + l.unit_id === url.searchParams.get("unit_id")),
          ),
        );
      if (url.pathname.includes("/rpc/")) {
        const execute = async () => {
          try {
            await db.exec(
              `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
            );
            if (url.pathname.endsWith("learning_snapshot")) {
              const r = await db.query<{ value: unknown }>(
                "select public.learning_snapshot() as value",
              );
              await fulfill(r.rows[0].value);
            } else {
              await db.query(
                "select public.apply_learning_operation($1::jsonb)",
                [JSON.stringify(body.p_operation)],
              );
              await fulfill(null);
            }
          } catch (e) {
            await fulfill(
              { message: (e as Error).message, code: "P0001" },
              400,
            );
          }
        };
        locked = locked.then(execute);
        await locked;
        return;
      }
      return fulfill({});
    });
    return ctx;
  }
  try {
    const ctx = await setup(),
      page = await ctx.newPage();
    await page.goto("/");
    await page.screenshot({ path: "artifacts/supabase/auth-desktop.png" });
    await page
      .getByRole("button", { name: "Tạo tài khoản", exact: true })
      .click();
    await page.getByLabel("Tên hiển thị").fill("An");
    await page.getByLabel("Email", { exact: true }).fill("a@example.test");
    await page.getByLabel("Mật khẩu", { exact: true }).fill("Example-pass-123");
    await page.getByLabel("Nhập lại mật khẩu").fill("Example-pass-123");
    await page.getByRole("button", { name: "Đăng ký", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("email xác nhận");
    await page
      .getByRole("button", { name: "Đã có tài khoản? Đăng nhập" })
      .click();
    await page.getByLabel("Mật khẩu", { exact: true }).fill("wrong");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("chưa đúng");
    await page.getByLabel("Mật khẩu", { exact: true }).fill("Example-pass-123");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.getByLabel("Tên của bạn").fill("An");
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page
      .getByRole("button", { name: "Bắt đầu hành trình", exact: true })
      .last()
      .click();
    await expect(
      page.getByRole("heading", { name: "Chào An, cùng học thôi!" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Hành trình", exact: true })
      .first()
      .click();
    await page.locator(".sample-library summary").click();
    await page
      .locator(".sample-library")
      .getByRole("button", { name: /你好! Xin chào/ })
      .click();
    await page
      .getByRole("button", { name: "Bắt đầu học", exact: true })
      .click();
    await page.getByRole("button", { name: "Mình đã hiểu, thử nào" }).click();
    await page.getByRole("button", { name: /^\d+ 你好$/ }).click();
    await page.getByRole("button", { name: "Kiểm tra", exact: true }).click();
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.waitForTimeout(1200);
    await page.reload();
    await page.getByRole("button", { name: "Tiếp tục màn đang học" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Lắng nghe và chọn điều bạn nghe được",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^\d+ 谢谢$/ }).click();
    await page.getByRole("button", { name: "Kiểm tra", exact: true }).click();
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    for (const [h, m] of [
      ["你好", "Xin chào"],
      ["谢谢", "Cảm ơn"],
      ["再见", "Tạm biệt"],
    ]) {
      await page.getByRole("button", { name: h, exact: true }).click();
      await page.getByRole("button", { name: m, exact: true }).click();
    }
    await page.getByRole("button", { name: "Kiểm tra", exact: true }).click();
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    for (const w of ["我", "是", "学生"])
      await page
        .locator(".token-bank")
        .getByRole("button", { name: w, exact: true })
        .click();
    await page.getByRole("button", { name: "Kiểm tra", exact: true }).click();
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Hoàn thành bài học", exact: true })
      .click();
    await page.getByRole("button", { name: "Lưu kết quả & tiếp tục" }).click();
    await expect(page.locator(".sync-banner")).toContainText("Đã đồng bộ");
    await page
      .getByRole("button", { name: "Tổng quan", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Bắt đầu bài học tiếp theo" })
      .click();
    // Reload between two teaching screens, rather than only between questions.
    for (const s of beginner.lessons[0].screens.slice(0, 3)) {
      await expect(
        page.getByRole("heading", { name: s.title, exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    }
    await expect
      .poll(async () => {
        await locked;
        const result = await db.query<any>(
          "select state_json from public.stage_progress where lesson_id='intro-one-two-v1'",
        );
        return result.rows[0]?.state_json.screenIndex;
      })
      .toBe(3);
    await page.reload();
    await page.getByRole("button", { name: "Tiếp tục màn đang học" }).click();
    for (const s of beginner.lessons[0].screens.slice(3)) {
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", {
          name: s.kind === "exercise" ? s.question.prompt : s.title,
          exact: true,
        }),
      ).toBeVisible();
      if (s.kind === "exercise") {
        if (s.question.type === "match") {
          for (const pair of s.question.options) {
            const [left, right] = pair.split("|");
            await dialog
              .getByRole("button", { name: left, exact: true })
              .click();
            await dialog
              .getByRole("button", { name: right, exact: true })
              .click();
          }
        } else
          await dialog
            .locator(".answers button")
            .filter({ hasText: s.question.answer })
            .click();
        await dialog
          .getByRole("button", { name: "Kiểm tra", exact: true })
          .click();
      } else if (s.kind === "notebook")
        for (const checkbox of await dialog.getByRole("checkbox").all())
          await checkbox.check();
      await dialog
        .getByRole("button", { name: "Tiếp tục", exact: true })
        .click();
    }
    await page.getByRole("button", { name: "Lưu kết quả & tiếp tục" }).click();
    await expect
      .poll(async () => {
        await locked;
        return (await db.query("select * from public.study_sessions")).rows
          .length;
      })
      .toBe(2);
    // The published 1A uses actual RLS/RPC scoring and separate no-XP recall.
    await page
      .getByRole("button", { name: "Hành trình", exact: true })
      .first()
      .click();
    await page.getByRole("combobox").selectOption("hanzione-book1-preview");
    await page.getByRole("button", { name: /^Bài 1 · Chào hỏi/ }).click();
    await page
      .getByRole("region", { name: "Danh sách bài trong chương" })
      .getByRole("button", { name: "Học ngay", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toContainText("XEM TRƯỚC");
    for (let i = 0; i < 3; i++)
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Tiếp tục", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Mình đã thử nhớ · Xem đáp án" })
      .click();
    await page.getByRole("button", { name: "Chưa nhớ", exact: true }).click();
    await expect
      .poll(async () => {
        await locked;
        const row = (
          await db.query<any>(
            "select state_json from public.stage_progress where lesson_id='hanzione-b1-l01a'",
          )
        ).rows[0];
        return row?.state_json.recallRatings["greeting-meaning"]?.correct;
      })
      .toBe(false);
    await page.reload();
    await page.getByRole("button", { name: "Tiếp tục màn đang học" }).click();
    await expect(
      page.getByRole("region", { name: "Thẻ tự nhớ" }),
    ).toContainText("Thẻ 2/5");
    for (let i = 1; i < 5; i++) {
      await page
        .getByRole("button", { name: "Mình đã thử nhớ · Xem đáp án" })
        .click();
      await page.getByRole("button", { name: "Nhớ được", exact: true }).click();
    }
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Tiếp tục", exact: true })
      .click();
    for (const c of await page.getByRole("dialog").getByRole("checkbox").all())
      await c.check();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Tiếp tục", exact: true })
      .click();
    for (const q of lesson1a.questions) {
      const d = page.getByRole("dialog");
      if (q.type === "match")
        for (const pair of q.options) {
          const [a, b] = pair.split("|");
          await d.getByRole("button", { name: a, exact: true }).click();
          await d.getByRole("button", { name: b, exact: true }).click();
        }
      else if (q.type === "sentence")
        for (const w of ["你", "好"])
          await d
            .locator(".token-bank")
            .getByRole("button", { name: w, exact: true })
            .click();
      else
        await d
          .getByRole("button", { name: new RegExp(`^\\d+ ${q.answer}$`) })
          .click();
      await d.getByRole("button", { name: "Kiểm tra", exact: true }).click();
      await d.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    }
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Tiếp tục", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Đúng 5/5");
    await page.getByRole("button", { name: "Lưu kết quả & tiếp tục" }).click();
    await expect(page.locator(".sync-banner")).toContainText("Đã đồng bộ");
    await expect
      .poll(async () => {
        await locked;
        return Number(
          (
            await db.query<any>(
              "select interval_days from public.review_items where content_id='你好'",
            )
          ).rows[0]?.interval_days,
        );
      })
      .toBe(0);
    expect(
      (
        await db.query<any>(
          "select xp_earned from public.study_sessions where lesson_id='hanzione-b1-l01a'",
        )
      ).rows[0].xp_earned,
    ).toBe(40);
    await page
      .getByRole("button", { name: "Sổ tay", exact: true })
      .first()
      .click();
    await page.getByLabel("Ghi chú cá nhân").fill("Ghi chú đồng bộ A");
    await expect(page.locator(".sync-banner")).toContainText("Đã đồng bộ");
    const phoneCtx = await setup(390),
      phone = await phoneCtx.newPage();
    await phone.goto("/");
    await phone.screenshot({ path: "artifacts/supabase/auth-mobile.png" });
    await phone.getByLabel("Email", { exact: true }).fill("a@example.test");
    await phone
      .getByLabel("Mật khẩu", { exact: true })
      .fill("Example-pass-123");
    await phone.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(
      phone.getByRole("heading", { name: "Chào An, cùng học thôi!" }),
    ).toBeVisible();
    await expect(phone.locator(".sync-banner")).toContainText("Đã đồng bộ");
    await phone
      .getByRole("button", { name: "Sổ tay", exact: true })
      .last()
      .click();
    await expect(phone.getByLabel("Ghi chú cá nhân")).toHaveValue(
      "Ghi chú đồng bộ A",
    );
    await phone.screenshot({ path: "artifacts/supabase/account-mobile.png" });
    await phoneCtx.setOffline(true);
    await phone.getByLabel("Ghi chú cá nhân").fill("Ghi chú offline A");
    await expect(phone.locator(".sync-banner")).toContainText("Ngoại tuyến");
    await phoneCtx.setOffline(false);
    await expect(phone.locator(".sync-banner")).toContainText("Đã đồng bộ");
    await page.reload();
    await page
      .getByRole("button", { name: "Sổ tay", exact: true })
      .first()
      .click();
    await expect(page.getByLabel("Ghi chú cá nhân")).toHaveValue(
      "Ghi chú offline A",
    );
    await page.screenshot({ path: "artifacts/supabase/account-desktop.png" });
    await phone
      .getByRole("button", { name: "Cài đặt", exact: true })
      .last()
      .click();
    await phone.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await expect(
      phone.getByRole("button", { name: "Đăng nhập", exact: true }),
    ).toBeVisible();
    await phone
      .getByRole("button", { name: "Tạo tài khoản", exact: true })
      .click();
    await phone.getByLabel("Tên hiển thị").fill("Bình");
    await phone.getByLabel("Email", { exact: true }).fill("b@example.test");
    await phone
      .getByLabel("Mật khẩu", { exact: true })
      .fill("Example-pass-123");
    await phone.getByLabel("Nhập lại mật khẩu").fill("Example-pass-123");
    await phone.getByRole("button", { name: "Đăng ký", exact: true }).click();
    await phone
      .getByRole("button", { name: "Đã có tài khoản? Đăng nhập" })
      .click();
    await phone
      .getByLabel("Mật khẩu", { exact: true })
      .fill("Example-pass-123");
    await phone.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(phone.getByLabel("Tên của bạn")).toHaveValue("Bình");
    await db.exec("reset role;");
    const rows = await db.query<{ xp_earned: number }>(
      "select xp_earned from public.study_sessions",
    );
    expect(rows.rows).toHaveLength(3);
    expect(rows.rows[0].xp_earned).toBe(40);
    const resetCtx = await setup(390),
      reset = await resetCtx.newPage();
    await reset.goto("/");
    await reset
      .getByRole("button", { name: "Quên mật khẩu", exact: true })
      .click();
    await reset.getByLabel("Email", { exact: true }).fill("a@example.test");
    await reset.getByRole("button", { name: "Gửi email đặt lại" }).click();
    await expect(reset.getByRole("status")).toContainText("liên kết đặt lại");
    await reset.evaluate(() =>
      localStorage.setItem(
        "sb-hanzi-qa-auth-token-code-verifier",
        JSON.stringify("mock-verifier/recovery"),
      ),
    );
    await reset.goto("/?code=mock-code&auth=recovery");
    await expect(
      reset.getByRole("heading", { name: "Đặt mật khẩu mới" }),
    ).toBeVisible();
    await reset
      .getByLabel("Mật khẩu", { exact: true })
      .fill("New-example-pass-123");
    await reset.getByLabel("Nhập lại mật khẩu").fill("New-example-pass-123");
    await reset.getByRole("button", { name: "Lưu mật khẩu mới" }).click();
    await expect(
      reset.getByRole("heading", { name: "Đặt mật khẩu mới" }),
    ).not.toBeVisible();
  } finally {
    for (const c of contexts) await c.close();
    await db.close();
  }
});
