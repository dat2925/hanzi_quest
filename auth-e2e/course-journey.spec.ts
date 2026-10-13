import { test, expect, type Page } from "@playwright/test";
import { lesson1a } from "../src/learning/book1";
import { demo } from "../src/learning/demo";
import { initial } from "../src/progress";

const courseId = "hanzione-book1-preview";
const makeLesson = (name: string, index: number) => {
  const id = `hanzione-b1-l${name}`;
  return {
    id,
    sort_order: index,
    units: { sort_order: Math.floor(index / 3), courses: { sort_order: 0 } },
    content_json: {
      ...lesson1a,
      id,
      title: `Bài ${name.toUpperCase()}`,
      learning: {
        ...lesson1a.learning!,
        id,
        title: `Bài ${name.toUpperCase()}`,
        status: "published",
      },
    },
  };
};

async function setup(page: Page) {
  const user = {
    id: "40000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "journey@example.test",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const token = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.mock`;
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
  const state = {
    rows: ["1a", "1b", "1c", "2a", "2b", "2c", "3a", "3b", "3c"].map(
      makeLesson,
    ),
    fail: false,
    courseRequests: 0,
  };
  await page.route("https://hanzi-qa.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = user;
    if (url.pathname.endsWith("learning_snapshot"))
      body = {
        progress: { ...initial, onboarded: true },
        stages: [],
        legacyPending: false,
      };
    else if (url.pathname.endsWith("/courses")) {
      state.courseRequests++;
      body = [
        {
          id: courseId,
          title: "HanziOne · Quyển 1",
          syllabus_version: "book1-v1",
        },
      ];
    } else if (url.pathname.endsWith("/lessons")) {
      expect(url.searchParams.get("is_published")).toBe("eq.true");
      if (url.searchParams.get("units.course_id") === `eq.${courseId}`) {
        if (state.fail)
          return route.fulfill({
            status: 500,
            json: { message: "Unavailable" },
          });
        body = state.rows;
      } else
        body = [
          {
            id: demo.id,
            content_json: demo,
            sort_order: 0,
            units: { sort_order: 0, courses: { sort_order: 1 } },
          },
        ];
    }
    await route.fulfill({ status: 200, json: body });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Hành trình", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  return state;
}

test("loads every published lesson through 3C for the built-in course and refreshes additions/removals", async ({
  page,
}) => {
  const state = await setup(page);
  const region = page.getByRole("region", {
    name: "Danh sách bài học của HanziOne · Quyển 1",
    exact: true,
  });
  await expect(region.getByRole("article")).toHaveCount(9);
  await expect(
    region.getByRole("heading", { name: "Bài 3C", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tất cả (9)", exact: true }),
  ).toBeVisible();
  const initialRequests = state.courseRequests;
  // IDs deliberately do not begin with the course ID; membership is relational.
  state.rows = [...state.rows.slice(0, 8), makeLesson("4a", 9)];
  await page
    .getByRole("button", { name: "Đồng bộ Cloud", exact: true })
    .click();
  await expect(
    region.getByRole("heading", { name: "Bài 4A", exact: true }),
  ).toBeVisible();
  await expect(
    region.getByRole("heading", { name: "Bài 3C", exact: true }),
  ).toHaveCount(0);
  await expect(region.getByRole("article")).toHaveCount(9);
  expect(state.courseRequests).toBe(initialRequests + 1);
});

test("sync errors are visible and can be retried", async ({ page }) => {
  const state = await setup(page);
  await expect(
    page.getByRole("button", { name: "Tất cả (9)", exact: true }),
  ).toBeVisible();
  state.fail = true;
  await page
    .getByRole("button", { name: "Đồng bộ Cloud", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Không thể đồng bộ" }),
  ).toBeVisible();
  state.fail = false;
  state.rows = [];
  await page
    .getByRole("button", { name: "Đồng bộ Cloud", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Tất cả (0)", exact: true }),
  ).toBeVisible();
});
