import { test, expect, type Page } from "@playwright/test";
import { book1, lesson1a } from "../src/learning/book1";
import { initial } from "../src/progress";

async function setup(
  page: Page,
  mode: "published" | "draft" | "error" | "loading",
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
        progress: { ...initial, onboarded: true },
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
