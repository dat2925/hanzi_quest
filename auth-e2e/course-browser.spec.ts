import { test, expect, type Page } from "@playwright/test";
import { book1, lesson1a } from "../src/learning/book1";
import { lesson1b } from "../src/learning/book1b";
import { initial } from "../src/progress";

async function setup(
  page: Page,
  mode: "published" | "draft" | "error" | "loading",
  include1b = false,
  completed1a = false,
) {
  const id = "40000000-0000-4000-8000-000000000001";
  const user = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "browser@example.test",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const token =
    Buffer.from('{"alg":"HS256"}').toString("base64url") +
    "." +
    Buffer.from(
      JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url") +
    ".mock";
  await page.addInitScript(
    ({ token, user }) =>
      localStorage.setItem(
        "sb-hanzi-qa-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "mock",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      ),
    { token, user },
  );
  const operations: any[] = [];
  const published = {
    ...lesson1a,
    learning: { ...lesson1a.learning!, status: "published" },
  };
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("https://hanzi-qa.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = user;
    if (url.pathname.endsWith("learning_snapshot"))
      body = {
        progress: {
          ...initial,
          onboarded: true,
          completed: completed1a ? [lesson1a.id] : [],
        },
        stages: [],
        legacyPending: false,
      };
    else if (url.pathname.endsWith("apply_learning_operation")) {
      operations.push(route.request().postDataJSON().p_operation);
      body = null;
    } else if (url.pathname.endsWith("/courses"))
      body =
        mode === "draft"
          ? []
          : [
              {
                id: book1.courseId,
                title: book1.title,
                syllabus_version: book1.syllabus.version,
              },
            ];
    else if (url.pathname.endsWith("/units")) body = book1.chapters;
    else if (url.pathname.endsWith("/lessons")) {
      if (url.searchParams.get("units.course_id") !== "eq." + book1.courseId)
        body = [];
      else {
        expect(url.searchParams.get("is_published")).toBe("eq.true");
        if (mode === "loading") await gate;
        if (mode === "error")
          return route.fulfill({
            status: 500,
            json: { message: "QA load failure" },
          });
        body =
          mode === "draft"
            ? []
            : [
                {
                  id: lesson1a.id,
                  content_json: published,
                  sort_order: 0,
                  units: { sort_order: 0, courses: { sort_order: 1 } },
                },
              ];
        if (include1b && mode !== "draft")
          (body as any[]).push({
            id: lesson1b.id,
            content_json: {
              ...lesson1b,
              learning: { ...lesson1b.learning!, status: "published" },
            },
            sort_order: 1,
            units: { sort_order: 0, courses: { sort_order: 1 } },
          });
        const idFilter = url.searchParams.get("id");
        if (idFilter)
          body = (body as any[]).filter((row) => "eq." + row.id === idFilter);
      }
    }
    await route.fulfill({ status: 200, json: body });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Hành trình", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  return { operations, release };
}

for (const completed1a of [false, true])
  test(`published 1B prerequisite and course/chapter navigation, completed1a=${completed1a}`, async ({
    page,
  }) => {
    const { operations } = await setup(page, "published", true, completed1a);
    const card = page.getByRole("region", { name: "Bài 1B", exact: true });
    await expect(card).toContainText("Đã xuất bản");
    await expect(card.getByRole("button", { name: /Xem thử/ })).toHaveCount(0);
    if (!completed1a) {
      await expect(card).toContainText("Hoàn thành Bài 1A");
      await expect(
        card.getByRole("button", { name: "Học ngay" }),
      ).toBeDisabled();
    } else {
      await card.getByRole("button", { name: "Học ngay" }).click();
      await expect(page.getByRole("dialog")).not.toContainText("XEM TRƯỚC");
      await expect
        .poll(() =>
          operations.some(
            (op) => op.kind === "stage" && op.payload.lesson.id === lesson1b.id,
          ),
        )
        .toBe(true);
      await page.getByRole("button", { name: "Đóng bài học" }).click();
    }
    await page.getByRole("combobox").selectOption(book1.courseId);
    await page.getByRole("button", { name: /^Bài 1 · Chào hỏi/ }).click();
    const article = page
      .getByRole("region", { name: "Danh sách bài trong chương" })
      .getByRole("article")
      .filter({ hasText: lesson1b.title });
    await expect(article).toBeVisible();
    await expect(article.getByRole("button")).toHaveText(
      completed1a ? "Học ngay" : "Xem điều kiện mở khóa",
    );
    if (completed1a) {
      await article.getByRole("button").click();
      await expect(page.getByRole("dialog")).toContainText(
        "1/7 · Pinyin được ghép như thế nào?",
      );
      await expect(page.getByRole("dialog")).not.toContainText("XEM TRƯỚC");
    }
  });

test("draft 1B previews without synchronized operations", async ({ page }) => {
  const { operations } = await setup(page, "published"); // 1A published, 1B hidden by RLS
  const card = page.getByRole("region", { name: "Bài 1B", exact: true });
  await expect(card).toContainText("Chưa có bản xuất bản Bài 1B");
  await card.getByRole("button", { name: /Xem thử/ }).click();
  await expect(page.getByRole("dialog")).toContainText("XEM TRƯỚC");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Tiếp tục", exact: true })
    .click();
  await page.getByRole("button", { name: "Đóng bài học" }).click();
  expect(
    operations.filter((op) => ["stage", "finish", "review"].includes(op.kind)),
  ).toEqual([]);
});

test("1B query errors and pending requests never masquerade as draft", async ({
  page,
}) => {
  const { release } = await setup(page, "loading", true);
  const card = page.getByRole("region", { name: "Bài 1B", exact: true });
  await expect(card).toContainText("Đang kiểm tra");
  await expect(card.getByRole("button")).toHaveCount(0);
  release();
  await expect(card).toContainText("Đã xuất bản");
  await page.route("https://hanzi-qa.supabase.co/rest/v1/lessons?**", (route) =>
    route.fulfill({ status: 500, json: { message: "QA error" } }),
  );
  await page
    .getByRole("button", { name: "Tải lại trạng thái giáo trình" })
    .click();
  await expect(card).toContainText("Chưa xác định được");
  await expect(
    card.getByRole("button", { name: /Xem thử|Học ngay/ }),
  ).toHaveCount(0);
});

test("published 1A opens the real lesson directly from the featured card and chapter list", async ({
  page,
}) => {
  const { operations } = await setup(page, "published");
  const featured = page.getByRole("region", { name: "Bài 1A", exact: true });
  await expect(featured).toContainText("Đã xuất bản");
  await expect(featured.getByRole("button", { name: /Xem thử/ })).toHaveCount(
    0,
  );
  await featured.getByRole("button", { name: "Học ngay" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "1/7 · Lời chào đầu tiên",
  );
  await expect(page.getByRole("dialog")).not.toContainText("XEM TRƯỚC");
  await expect
    .poll(() =>
      operations.some(
        (op) => op.kind === "stage" && op.payload.lesson.id === lesson1a.id,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Đóng bài học" }).click();
  await page.getByRole("combobox").selectOption(book1.courseId);
  await page.getByRole("button", { name: /^Bài 1 · Chào hỏi/ }).click();
  const list = page.getByRole("region", { name: "Danh sách bài trong chương" });
  await expect(list).toContainText(lesson1a.title);
  await list.getByRole("button", { name: "Học ngay" }).click();
  await expect(page.getByRole("dialog")).not.toContainText("XEM TRƯỚC");
  await expect(
    page.getByRole("heading", { name: "1/7 · Lời chào đầu tiên" }),
  ).toBeVisible();
});

test("RLS hides draft content: show a clearly identified local preview without saving progress", async ({
  page,
}) => {
  const { operations } = await setup(page, "draft");
  const featured = page.getByRole("region", { name: "Bài 1A", exact: true });
  await expect(featured).toContainText(
    "Chưa có bản xuất bản hiển thị cho tài khoản này",
  );
  await expect(featured.getByRole("button", { name: "Học ngay" })).toHaveCount(
    0,
  );
  await featured.getByRole("button", { name: /Xem thử Bài 1A/ }).click();
  await expect(page.getByRole("dialog")).toContainText("XEM TRƯỚC");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Tiếp tục", exact: true })
    .click();
  await page.getByRole("button", { name: "Đóng bài học" }).click();
  expect(
    operations.filter((op) => ["stage", "finish", "review"].includes(op.kind)),
  ).toEqual([]);
});

test("Supabase failure is unknown status, never a draft or a playable cached lesson", async ({
  page,
}) => {
  await setup(page, "error");
  const featured = page.getByRole("region", { name: "Bài 1A", exact: true });
  await expect(featured).toContainText(
    "Chưa xác định được bài đã xuất bản hay chưa",
  );
  await expect(featured.getByRole("button", { name: "Học ngay" })).toHaveCount(
    0,
  );
  await expect(featured.getByRole("button", { name: /Xem thử/ })).toHaveCount(
    0,
  );
  await expect(featured).not.toContainText("đang chờ duyệt");
});

test("while the publication query is pending, neither Study nor Preview is offered", async ({
  page,
}) => {
  const { release } = await setup(page, "loading");
  const featured = page.getByRole("region", { name: "Bài 1A", exact: true });
  await expect(featured).toContainText("Đang kiểm tra bản xuất bản");
  await expect(featured.getByRole("button")).toHaveCount(0);
  release();
  await expect(
    featured.getByRole("button", { name: "Học ngay" }),
  ).toBeVisible();
});
