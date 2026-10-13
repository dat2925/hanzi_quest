import { test, expect, type Page } from "@playwright/test";
import {
  adminFixture,
  adminIds,
  tokenFor,
} from "../tests/helpers/admin-fixture";
import { operation } from "../src/cloud/operations";
import { mkdir } from "node:fs/promises";

async function setup(page: Page, actor = adminIds[0]) {
  const f = await adminFixture({ platform: true });
  await f.as(actor);
  await f.db.query("select public.learning_snapshot()");
  await f.db.query("select public.apply_learning_operation($1::jsonb)", [
    JSON.stringify(operation("profile", { onboarded: true })),
  ]);
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
    { token: tokenFor(actor), user: f.user(actor) },
  );
  for (const pattern of ["https://hanzi-qa.supabase.co/**", "**/api/admin/**"])
    await page.route(pattern, async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const response = await fetch(
        (url.hostname === "hanzi-qa.supabase.co" ? f.sbUrl : f.apiUrl) +
          url.pathname +
          url.search,
        {
          method: request.method(),
          headers: request.headers(),
          ...(request.postData() ? { body: request.postData()! } : {}),
        },
      );
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: await response.text(),
      });
    });
  return f;
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", {
    name: "Mở menu quản trị",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation", { name: "Menu quản trị" })
    .getByRole("button", { name, exact: true })
    .click();
}

for (const width of [390, 1440])
  test(`platform user/course/lesson/audit flows with real API at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const f = await setup(page);
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    try {
      await page.setViewportSize({ width, height: 950 });
      await page.goto("/?admin=users");
      await expect(
        page.getByRole("heading", { name: "Quản lý người dùng", exact: true }),
      ).toBeVisible();
      const row = page
        .getByRole("row")
        .filter({ hasText: "user2@example.test" });
      await row.getByRole("button").click();
      let drawer = page.getByRole("dialog").last();
      await drawer
        .getByRole("button", { name: "Sửa hồ sơ", exact: true })
        .click();
      const profile = page.getByRole("dialog").last();
      await profile.getByLabel(/Tên hiển thị/).fill("Học viên Lan");
      await profile
        .getByRole("button", { name: "Lưu thay đổi", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await expect(
        page.getByRole("heading", { name: "Học viên Lan", exact: true }),
      ).toBeVisible();
      drawer = page.getByRole("dialog");
      await drawer
        .getByRole("button", { name: "Tạm khóa sử dụng", exact: true })
        .click();
      const access = page.getByRole("dialog").last();
      await access.getByRole("textbox").fill("Kiểm thử quyền sử dụng");
      await access.getByRole("button", { name: /Xác nhận/ }).click();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await expect(drawer).toContainText("Tạm khóa");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page
        .getByPlaceholder("Tìm theo email, tên hiển thị hoặc UUID...")
        .fill("Học viên Lan");
      await expect(
        page.getByRole("row").filter({ hasText: "user2@example.test" }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("row").filter({ hasText: "user3@example.test" }),
      ).toHaveCount(0);
      await mkdir("artifacts/admin-platform", { recursive: true });
      await page.screenshot({
        path: `artifacts/admin-platform/users-${width}.png`,
        fullPage: true,
      });
      await navigate(page, "Khóa học & Chương");
      await page
        .getByRole("button", { name: "Tạo khóa học mới", exact: true })
        .click();
      const course = page.getByRole("dialog");
      await course.getByLabel(/Mã định danh/).fill(`qa-ui-course-${width}`);
      await course.getByLabel(/Tên khóa học/).fill("Khóa giao diện mới");
      await course.getByLabel(/Phiên bản giáo trình/).fill("qa-ui-v1");
      await course
        .getByRole("button", { name: "Tạo khóa học", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("row").filter({ hasText: `qa-ui-course-${width}` }),
      ).toBeVisible();
      await navigate(page, "Bài học & Giáo trình");
      await page
        .getByRole("combobox", { name: "Lọc theo khóa học" })
        .selectOption("hanzione-book1-preview");
      await expect(
        page.getByRole("row").filter({ hasText: "hanzione-b1-l01c" }),
      ).toBeVisible();
      const lesson = page
        .getByRole("row")
        .filter({ hasText: "hanzione-b1-l01c" });
      await lesson
        .getByRole("button", { name: "Xem thử", exact: true })
        .click();
      await expect(page.locator(".learning-page")).toContainText("XEM TRƯỚC");
      await page
        .getByRole("button", { name: "Đóng bài học", exact: true })
        .click();
      await lesson.getByRole("button", { name: "Ẩn bài", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /Xác nhận ẩn/ })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        lesson.getByRole("button", { name: "Hiện bài", exact: true }),
      ).toBeVisible();
      await navigate(page, "Nhật ký hoạt động");
      await page.getByPlaceholder(/Tìm theo hành động/).fill("user.update");
      await expect(
        page.getByRole("row").filter({ hasText: "user.update" }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("button", { name: "Xem thay đổi", exact: true }),
      ).toHaveCount(1);
      await page
        .getByRole("button", { name: "Xem thay đổi", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText("Học viên Lan");
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Xem thay đổi", exact: true }),
      ).toBeFocused();
      await page
        .getByRole("button", { name: "Đổi giao diện", exact: true })
        .click();
      await expect(page.locator(".admin-topbar")).toHaveCSS(
        "background-color",
        "rgb(37, 51, 41)",
      );
      await page.screenshot({
        path: `artifacts/admin-platform/audit-dark-${width}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await f.close();
    }
  });

test("member, editor, network and revoked-session states do not expose admin data", async ({
  page,
}) => {
  const f = await setup(page, adminIds[1]);
  try {
    await page.goto("/?admin=users");
    await expect(
      page.getByRole("heading", { name: /Truy cập bị từ chối/ }),
    ).toBeVisible();
    await f.db.exec("reset role;");
    await f.db.query(
      "insert into public.curriculum_admins(user_id) values($1)",
      [adminIds[1]],
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "HanziOne · Biên tập giáo trình" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Menu quản trị" }),
    ).toHaveCount(0);
    await page.route("**/api/admin/access", (route) => route.abort());
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Không thể kết nối khu vực quản trị" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Quản lý người dùng" }),
    ).toHaveCount(0);
  } finally {
    await f.close();
  }
});

test("changed form payload gets a new request ID; an identical network retry keeps its ID", async ({
  page,
}) => {
  const f = await setup(page);
  const payloads: any[] = [];
  await page.route("**/api/admin/commands/course.save", async (route) => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({
      status: 400,
      json: { error: "Lỗi kiểm thử, hãy sửa tên" },
    });
  });
  try {
    await page.goto("/?admin=courses");
    await page
      .getByRole("button", { name: "Tạo khóa học mới", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Mã định danh/).fill("qa-identity");
    await dialog.getByLabel(/Tên khóa học/).fill("Tên A");
    await dialog.getByLabel(/Phiên bản giáo trình/).fill("qa-v1");
    const submit = dialog.getByRole("button", {
      name: "Tạo khóa học",
      exact: true,
    });
    await submit.click();
    await expect(dialog).toContainText("Lỗi kiểm thử");
    await submit.click();
    await expect.poll(() => payloads.length).toBe(2);
    expect(payloads[0].requestId).toBe(payloads[1].requestId);
    await dialog.getByLabel(/Tên khóa học/).fill("Tên B");
    await submit.click();
    await expect.poll(() => payloads.length).toBe(3);
    expect(payloads[2].requestId).not.toBe(payloads[1].requestId);
  } finally {
    await f.close();
  }
});

test("profile conflicts preserve edits and revoked permissions remove the loaded workspace", async ({
  page,
}) => {
  const f = await setup(page);
  try {
    await page.goto("/?admin=users");
    await page
      .getByRole("row")
      .filter({ hasText: "user2@example.test" })
      .getByRole("button")
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sửa hồ sơ", exact: true })
      .click();
    const form = page.getByRole("dialog").last();
    await form.getByLabel(/Tên hiển thị/).fill("Nội dung giữ lại");
    await f.db.exec("reset role;");
    await f.db.query(
      "insert into public.profiles(id,display_name) values($1,'Bản mới từ học viên')",
      [adminIds[1]],
    );
    await form
      .getByRole("button", { name: "Lưu thay đổi", exact: true })
      .click();
    await expect(form).toContainText("Hồ sơ người dùng đã có thay đổi");
    await expect(form.getByLabel(/Tên hiển thị/)).toHaveValue(
      "Nội dung giữ lại",
    );
    await form
      .getByRole("button", {
        name: "Tải bản mới, giữ nội dung đang sửa",
        exact: true,
      })
      .click();
    await expect(form).toContainText("Bản mới từ học viên");
    await expect(form.getByLabel(/Tên hiển thị/)).toHaveValue(
      "Nội dung giữ lại",
    );
    await form
      .getByRole("button", { name: "Lưu thay đổi", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Nội dung giữ lại", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await f.db.exec("reset role;");
    await f.db.query("delete from public.platform_admins where user_id=$1", [
      adminIds[0],
    ]);
    await f.db.query("delete from public.curriculum_admins where user_id=$1", [
      adminIds[0],
    ]);
    await page.getByRole("button", { name: "Làm mới", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: /Truy cập bị từ chối/ }),
    ).toBeVisible();
    await expect(
      page.getByText("user2@example.test", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await f.close();
  }
});
