import { test, expect, type Page } from "@playwright/test";
import {
  adminFixture,
  adminIds,
  qaBatch,
  tokenFor,
} from "../tests/helpers/admin-fixture";
import { operation, questionKey } from "../src/cloud/operations";
import { lesson1a } from "../src/learning/book1";
import { lesson1b } from "../src/learning/book1b";
import { lesson1c } from "../src/learning/book1c";

async function session(
  page: Page,
  f: Awaited<ReturnType<typeof adminFixture>>,
  id: string,
) {
  await page.addInitScript(
    ({ token, user }) =>
      localStorage.setItem(
        "sb-hanzi-qa-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "mock",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      ),
    { token: tokenFor(id), user: f.user(id) },
  );
  await page.route("https://hanzi-qa.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const response = await fetch(f.sbUrl + url.pathname + url.search, {
      method: request.method(),
      headers: request.headers(),
      ...(request.postData() ? { body: request.postData()! } : {}),
    });
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: await response.text(),
    });
  });
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const response = await fetch(f.apiUrl + url.pathname + url.search, {
      method: request.method(),
      headers: request.headers(),
      ...(request.postData() ? { body: request.postData()! } : {}),
    });
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: await response.text(),
    });
  });
  await f.as(id);
  await f.db.query("select public.learning_snapshot()");
  await f.db.query("select public.apply_learning_operation($1::jsonb)", [
    JSON.stringify(operation("profile", { onboarded: true })),
  ]);
}

for (const width of [390, 1440])
  test(`admin real API/PostgreSQL batch import, preview, approval, publication and dynamic path at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const f = await adminFixture({ platform: true });
    try {
      await page.setViewportSize({ width, height: 900 });
      await session(page, f, adminIds[0]);
      for (const l of [lesson1a, lesson1b, lesson1c])
        await f.db.query("select public.apply_learning_operation($1::jsonb)", [
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
      const before = (
        await f.db.query<{ value: any }>(
          "select public.learning_snapshot() value",
        )
      ).rows[0].value.progress;
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/?admin=curriculum");
      await expect(
        page.getByRole("heading", { name: "Admin Curriculum", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("combobox", { name: "Khóa quản trị" })
        .selectOption("hanzione-book1-preview");
      await expect(
        page.getByText("hanzione-b1-l01c", { exact: true }),
      ).toBeVisible();
      await page.getByLabel("File curriculum quản trị").setInputFiles({
        name: "qa-book1-batch.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(qaBatch())),
      });
      await page.getByRole("button", { name: "Kiểm tra toàn bộ JSON" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "JSON hợp lệ: 5 bài" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: /Xem thử: \[QA ONLY\].*1$/ })
        .click();
      await expect(page.locator(".learning-page")).toContainText("XEM TRƯỚC");
      await expect(page.locator(".learning-page")).toContainText(
        "1/7 · Một âm, nhiều thanh điệu",
      );
      await page
        .locator(".learning-page")
        .getByRole("button", { name: "Tiếp tục", exact: true })
        .click();
      await page.getByRole("button", { name: "Đóng bài học" }).click();
      await page.getByRole("button", { name: "Lưu lô bản nháp" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "Đã lưu toàn bộ lô" }),
      ).toBeVisible();
      const articles = page
        .locator(".admin-lessons article")
        .filter({ hasText: "[QA ONLY]" });
      await expect(articles).toHaveCount(5);
      for (const c of await articles.getByRole("checkbox").all())
        await c.check();
      await expect(
        page.getByRole("button", { name: "Chuẩn bị xuất bản" }),
      ).toBeDisabled();
      await page.getByRole("checkbox", { name: /Đã đối chiếu nguồn/ }).check();
      await page.getByRole("checkbox", { name: /Đã xem thử từng bài/ }).check();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/admin-curriculum-${width}.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Duyệt các bản nháp đã chọn" })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Đã duyệt phiên bản" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Chuẩn bị xuất bản" }).click();
      await expect(
        page.getByRole("heading", { name: "Xác nhận xuất bản 5 bài" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Xác nhận xuất bản lô đã duyệt" })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Đã xuất bản." }),
      ).toBeVisible();
      await expect(
        articles.getByText("published · chỉ đọc", { exact: true }),
      ).toHaveCount(5);
      await f.serial(async () => {
        await f.as(adminIds[0]);
        const after = (
          await f.db.query<{ value: any }>(
            "select public.learning_snapshot() value",
          )
        ).rows[0].value.progress;
        expect(after).toEqual(before);
      });
      const adminMenu = page.getByRole("button", {
        name: "Mở menu quản trị",
        exact: true,
      });
      if (await adminMenu.isVisible()) await adminMenu.click();
      await page
        .getByRole("button", { name: "Quay về ứng dụng học", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Hành trình", exact: true })
        .filter({ visible: true })
        .first()
        .click();
      const fresh = page
        .getByRole("region", {
          name: "Danh sách bài học của HanziOne · Quyển 1",
          exact: true,
        })
        .getByRole("article")
        .filter({
          has: page.getByRole("heading", {
            name: "[QA ONLY] Lô Quyển 1 · 1",
            exact: true,
          }),
        });
      await expect(fresh).toBeVisible();
      await fresh.getByRole("button", { name: "Học ngay" }).click();
      await expect(page.locator(".learning-session")).toBeVisible();
      await expect(page.locator(".learning-page")).not.toContainText(
        "XEM TRƯỚC",
      );
      expect(errors).toEqual([]);
    } finally {
      await f.close();
    }
  });

test("ordinary student cannot open Admin Curriculum or call batch writes", async ({
  page,
}) => {
  const f = await adminFixture({ platform: true });
  try {
    await session(page, f, adminIds[1]);
    await page.goto("/?admin=curriculum");
    await expect(
      page.getByRole("heading", { name: /Truy cập bị từ chối/ }),
    ).toBeVisible();
    await expect(page.getByLabel("JSON giáo trình")).toHaveCount(0);
    expect(
      (
        await f.request(
          "/save",
          { requestId: crypto.randomUUID(), bundle: qaBatch() },
          adminIds[1],
        )
      ).status,
    ).toBe(403);
  } finally {
    await f.close();
  }
});
