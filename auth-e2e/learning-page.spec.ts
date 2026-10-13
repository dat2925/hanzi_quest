import { test, expect, type Page } from "@playwright/test";
import {
  adminFixture,
  adminIds,
  tokenFor,
} from "../tests/helpers/admin-fixture";
import { operation } from "../src/cloud/operations";
import { lesson1a } from "../src/learning/book1";
import { mkdir } from "node:fs/promises";

async function setup(page: Page, publish1c = true) {
  const f = await adminFixture({ platform: true, publish1c });
  await f.as(adminIds[0]);
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
    { token: tokenFor(adminIds[0]), user: f.user(adminIds[0]) },
  );
  for (const pattern of ["https://hanzi-qa.supabase.co/**", "**/api/admin/**"])
    await page.route(pattern, async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      const res = await fetch(
        (url.hostname === "hanzi-qa.supabase.co" ? f.sbUrl : f.apiUrl) +
          url.pathname +
          url.search,
        {
          method: req.method(),
          headers: req.headers(),
          ...(req.postData() ? { body: req.postData()! } : {}),
        },
      );
      await route.fulfill({
        status: res.status,
        contentType: "application/json",
        body: await res.text(),
      });
    });
  return f;
}
async function sevenScreens(page: Page) {
  const d = page.locator(".learning-page");
  const next = () =>
    d.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await next();
  await next();
  await next();
  for (let i = 0; i < 5; i++) {
    await d
      .getByRole("button", { name: "Mình đã thử nhớ · Xem đáp án" })
      .click();
    await d.getByRole("button", { name: "Nhớ được", exact: true }).click();
  }
  await next();
  await d.getByRole("button", { name: "Che mẫu để tự viết" }).click();
  await expect(d.locator(".lesson-example")).toHaveCount(0);
  await d.getByRole("button", { name: "Hiện mẫu để đối chiếu" }).click();
  for (const c of await d.getByRole("checkbox").all()) await c.check();
  await next();
  for (const q of lesson1a.questions) {
    await expect(
      d.getByRole("heading", { name: q.prompt, exact: true }),
    ).toBeVisible();
    if (q.type === "match")
      for (const pair of q.options) {
        const [a, b] = pair.split("|");
        await d.getByRole("button", { name: a, exact: true }).click();
        await d.getByRole("button", { name: b, exact: true }).click();
      }
    else if (q.type === "sentence") {
      let rest = q.answer;
      const tokens = [...q.options];
      while (rest) {
        const i = tokens.findIndex((t) => rest.startsWith(t));
        const token = tokens.splice(i, 1)[0];
        await d
          .locator(".token-bank")
          .getByRole("button", { name: token, exact: true })
          .click();
        rest = rest.slice(token.length);
      }
    } else {
      const buttons = d.locator(".answers button");
      for (const b of await buttons.all())
        if ((await b.innerText()).replace(/^\d+\s*/, "").trim() === q.answer) {
          await b.click();
          break;
        }
    }
    await d.getByRole("button", { name: "Kiểm tra", exact: true }).click();
    await next();
  }
  await expect(
    d.getByRole("heading", { name: "7/7 · Nhớ lâu bằng những lần ôn ngắn" }),
  ).toBeVisible();
  await next();
}

test("finishing all seven screens in preview creates no XP, SRS or checkpoint", async ({
  page,
}) => {
  const f = await setup(page);
  try {
    await page.goto("/?page=path");
    const row = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: lesson1a.title, exact: true }),
    });
    await row.getByRole("button", { name: "Xem trước", exact: true }).click();
    await expect(page).toHaveURL(/\/learn\/preview$/);
    await sevenScreens(page);
    await expect(
      page.getByText("KẾT THÚC XEM THỬ", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".learning-result-stats")).not.toContainText(
      "+40",
    );
    await f.serial(async () => {
      await f.db.exec("reset role;");
      for (const table of ["study_sessions", "stage_progress", "review_items"])
        expect(
          (await f.db.query(`select count(*)::int n from public.${table}`))
            .rows[0],
        ).toEqual({ n: 0 });
      expect(
        (
          await f.db.query(
            "select total_xp from public.user_stats where user_id=$1",
            [adminIds[0]],
          )
        ).rows[0],
      ).toEqual({ total_xp: 0 });
    });
    await page.getByRole("button", { name: "Quay lại", exact: true }).click();
    await expect(page).toHaveURL(/\?page=path$/);
  } finally {
    await f.close();
  }
});

for (const width of [390, 1440])
  test(`full page 7-screen lesson, checkpoint refresh and server receipt at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const f = await setup(page);
    let releaseFinish = () => {};
    let heldFinish = false;
    if (width === 390) {
      const gate = new Promise<void>((resolve) => {
        releaseFinish = resolve;
      });
      await page.route(
        "https://hanzi-qa.supabase.co/rest/v1/rpc/apply_learning_operation",
        async (route) => {
          const request = route.request();
          if (request.postDataJSON().p_operation.kind === "finish") {
            heldFinish = true;
            await gate;
          }
          const url = new URL(request.url());
          const response = await fetch(f.sbUrl + url.pathname, {
            method: request.method(),
            headers: request.headers(),
            body: request.postData()!,
          });
          await route.fulfill({
            status: response.status,
            contentType: "application/json",
            body: await response.text(),
          });
        },
      );
    }
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (dialog) => void dialog.accept());
    try {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/?page=path");
      const row = page
        .getByRole("region", {
          name: "Danh sách bài học của HanziOne · Quyển 1",
          exact: true,
        })
        .getByRole("article")
        .filter({
          has: page.getByRole("heading", { name: lesson1a.title, exact: true }),
        });
      await row.getByRole("button", { name: "Học ngay", exact: true }).click();
      await expect(page).toHaveURL(/\/learn\/hanzione-b1-l01a$/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator(".sidebar")).toBeHidden();
      await expect(page.locator(".bottom-nav")).toBeHidden();
      await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "0",
      );
      await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "2/7 · Ba mục từ của hôm nay" }),
      ).toBeVisible();
      await mkdir("artifacts/learning-page", { recursive: true });
      await page.screenshot({
        path: `artifacts/learning-page/vocabulary-${width}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      // Re-enter from a retained checkpoint; a browser back never marks completion.
      page.removeAllListeners("dialog");
      page.once("dialog", (dialog) => void dialog.dismiss());
      await page
        .getByRole("button", { name: "Đóng bài học", exact: true })
        .click();
      await expect(page).toHaveURL(/\/learn\/hanzione-b1-l01a$/);
      page.on("dialog", (dialog) => void dialog.accept());
      await page.goBack();
      await expect(page).toHaveURL(/page=path/);
      await page.goForward();
      await expect(
        page.getByRole("heading", { name: "2/7 · Ba mục từ của hôm nay" }),
      ).toBeVisible();
      // Finish the remaining screens with the same preserved session ID.
      await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
      await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
      for (let i = 0; i < 5; i++) {
        await page
          .getByRole("button", { name: "Mình đã thử nhớ · Xem đáp án" })
          .click();
        await page
          .getByRole("button", { name: "Nhớ được", exact: true })
          .click();
      }
      await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
      for (const c of await page
        .locator(".learning-page")
        .getByRole("checkbox")
        .all())
        await c.check();
      await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
      // Use question identities and the actual seeded answers, including sentence/match.
      for (const q of lesson1a.questions) {
        const d = page.locator(".learning-page");
        await expect(
          d.getByRole("heading", { name: q.prompt, exact: true }),
        ).toBeVisible();
        if (q.type === "match")
          for (const pair of q.options) {
            const [a, b] = pair.split("|");
            await d.getByRole("button", { name: a, exact: true }).click();
            await d.getByRole("button", { name: b, exact: true }).click();
          }
        else if (q.type === "sentence") {
          for (const token of ["你", "好"])
            await d
              .locator(".token-bank")
              .getByRole("button", { name: token, exact: true })
              .click();
        } else
          for (const b of await d.locator(".answers button").all())
            if (
              (await b.innerText()).replace(/^\d+\s*/, "").trim() === q.answer
            ) {
              await b.click();
              break;
            }
        await d.getByRole("button", { name: "Kiểm tra", exact: true }).click();
        await d.getByRole("button", { name: "Tiếp tục", exact: true }).click();
      }
      await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
      if (width === 390) {
        await expect.poll(() => heldFinish).toBe(true);
        await expect(
          page.getByText("ĐANG XÁC NHẬN KẾT QUẢ", { exact: true }),
        ).toBeVisible();
        await expect(page.locator(".learning-result-stats")).not.toContainText(
          "+40",
        );
        releaseFinish();
      }
      await expect(
        page.getByText("KẾT QUẢ ĐÃ LƯU", { exact: true }),
      ).toBeVisible();
      await expect(page.locator(".learning-result-stats")).toContainText("+40");
      await expect(
        page.getByRole("button", { name: "Học bài tiếp theo" }),
      ).toBeVisible();
      await page.screenshot({
        path: `artifacts/learning-page/result-${width}.png`,
        fullPage: true,
      });
      const beforeReviews = await f.serial(async () => {
        await f.db.exec("reset role;");
        return (
          await f.db.query(
            "select content_id,repetition_count,correct_count from public.review_items where user_id=$1 order by content_id",
            [adminIds[0]],
          )
        ).rows;
      });
      await page.reload();
      await expect(
        page.getByText("KẾT QUẢ ĐÃ LƯU", { exact: true }),
      ).toBeVisible();
      await f.db.exec("reset role;");
      const sessions = (
        await f.db.query(
          "select count(*)::int n from public.study_sessions where user_id=$1",
          [adminIds[0]],
        )
      ).rows[0] as { n: number };
      expect(sessions.n).toBe(1);
      expect(
        (
          await f.db.query(
            "select content_id,repetition_count,correct_count from public.review_items where user_id=$1 order by content_id",
            [adminIds[0]],
          )
        ).rows,
      ).toEqual(beforeReviews);
      await page.getByRole("button", { name: "Học bài tiếp theo" }).click();
      await expect(page).toHaveURL(/\/learn\/hanzione-b1-l01b$/);
      await page
        .getByRole("button", { name: "Đóng bài học", exact: true })
        .click();
      await expect(page).toHaveURL(/\?page=path$/);
      await expect(
        page.getByText("Đã đồng bộ bài học thành công!", { exact: true }),
      ).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      releaseFinish();
      await f.close();
    }
  });

test("direct URLs reject locked, unknown and unpublished lessons", async ({
  page,
}) => {
  const f = await setup(page, false);
  try {
    for (const [id, text] of [
      ["hanzione-b1-l01b", "chưa mở khóa"],
      ["hanzione-b1-l01c", "chưa được xuất bản"],
      ["unknown-lesson", "không tồn tại"],
    ]) {
      await page.goto(`/learn/${id}`);
      await expect(page.getByRole("alert")).toContainText(text);
      await expect(page.getByRole("progressbar")).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Quay lại", exact: true }).click();
    await expect(page).toHaveURL(/page=path/);
    await page.goto("/learn/preview");
    await expect(page.getByRole("alert")).toContainText(
      "Bản xem thử đã hết phiên",
    );
  } finally {
    await f.close();
  }
});

test("admin draft preview retains unsaved JSON and writes no learning data", async ({
  page,
}) => {
  const f = await setup(page, false);
  try {
    await page.goto("/?admin=curriculum");
    await page
      .getByRole("combobox", { name: "Khóa quản trị" })
      .selectOption("hanzione-book1-preview");
    await page
      .getByRole("button", { name: "Sửa nháp hanzione-b1-l01c", exact: true })
      .click();
    const input = page.getByLabel("JSON giáo trình");
    const bundle = JSON.parse(await input.inputValue());
    bundle.lessons[0].description += " · Bản sửa chưa lưu";
    const text = JSON.stringify(bundle, null, 2);
    await input.fill(text);
    await page
      .getByRole("button", { name: "Kiểm tra toàn bộ JSON", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "JSON hợp lệ" }),
    ).toBeVisible();
    const checkedText = await input.inputValue();
    await page
      .getByRole("button", { name: /^Xem thử: Quyển 1 · Bài 1C/ })
      .click();
    await expect(page).toHaveURL(/\/learn\/preview$/);
    await expect(page.locator(".learning-page")).toContainText("XEM TRƯỚC");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Đóng bài học", exact: true })
      .click();
    await expect(page).toHaveURL(/admin=curriculum/);
    await expect(input).toHaveValue(checkedText);
    await expect(input).toContainText("Bản sửa chưa lưu");
    await expect(
      page.getByRole("button", { name: "Lưu lô bản nháp", exact: true }),
    ).toBeEnabled();
    await f.db.exec("reset role;");
    expect(
      (await f.db.query("select count(*)::int n from public.study_sessions"))
        .rows[0],
    ).toEqual({ n: 0 });
    expect(
      (await f.db.query("select count(*)::int n from public.stage_progress"))
        .rows[0],
    ).toEqual({ n: 0 });
    expect(
      (
        await f.db.query(
          "select total_xp from public.user_stats where user_id=$1",
          [adminIds[0]],
        )
      ).rows[0],
    ).toEqual({ total_xp: 0 });
  } finally {
    await f.close();
  }
});
