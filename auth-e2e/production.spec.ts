import { test, expect } from "@playwright/test";
import { lessons } from "../src/data";
import { initial } from "../src/progress";
test("production single-file build installs all ten lessons after HTTP 200 without cache", async ({
  page,
  context,
}) => {
  test.skip(!process.env.AUTH_E2E_URL, "Requires the production QA build.");
  const id = "30000000-0000-4000-8000-000000000001";
  const user = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "production@example.test",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const token =
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
    ".mock";
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.clear();
      localStorage.setItem(
        "sb-hanzi-qa-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "mock-refresh",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          user,
        }),
      );
    },
    { token, user },
  );
  await context.route("https://hanzi-qa.supabase.co/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const body =
      path === "/rest/v1/lessons"
        ? lessons.map((l, i) => ({
            id: l.id,
            content_json: l,
            sort_order: i,
            units: { sort_order: 0, courses: { sort_order: 0 } },
          }))
        : path.endsWith("/learning_snapshot")
          ? {
              progress: { ...initial, name: "Production QA", onboarded: true },
              stages: [],
              legacyPending: false,
            }
          : user;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  // Catch even exceptions swallowed by the old fallback, without printing session data.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Debugger.enable");
  await cdp.send("Debugger.setPauseOnExceptions", { state: "all" });
  const preloadErrors: string[] = [];
  cdp.on("Debugger.paused", (event) => {
    if (event.data?.description?.includes("__VITE_PRELOAD__"))
      preloadErrors.push("ReferenceError: __VITE_PRELOAD__ is not defined");
    void cdp.send("Debugger.resume");
  });
  await page.goto("/");
  try {
    await expect(
      page.getByRole("heading", { name: "Chào Production QA, cùng học thôi!" }),
    ).toBeVisible({ timeout: 10000 });
  } finally {
    console.log("Production preload errors:", JSON.stringify(preloadErrors));
  }
  expect(preloadErrors).toEqual([]);
  const cache = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hanzi-curriculum-v1") || "null"),
  );
  expect(cache).toHaveLength(10);
  expect(cache.map((l: { id: string }) => l.id)).toEqual(
    lessons.map((l) => l.id),
  );
});
