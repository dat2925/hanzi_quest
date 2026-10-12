import { test, expect, type Page } from "@playwright/test";
import { initial } from "../src/progress";
import { beginner, demo } from "../src/learning/demo";
async function init(page: Page) {
  await page.addInitScript(
    (p) => {
      if (!localStorage.getItem("hanzi-quest-v1"))
        localStorage.setItem("hanzi-quest-v1", JSON.stringify(p));
    },
    { ...initial, onboarded: true },
  );
  await page.goto("/");
}
async function finishDemo(page: Page, preview = false, wrong = false) {
  let exercise = 0;
  for (const s of beginner.lessons[0].screens) {
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", {
        name: s.kind === "exercise" ? s.question.prompt : s.title,
        exact: true,
      }),
    ).toBeVisible();
    if (s.kind === "exercise") {
      const q = s.question;
      if (q.type === "match") {
        for (const pair of q.options) {
          const [left, right] = pair.split("|");
          await dialog.getByRole("button", { name: left, exact: true }).click();
          await dialog
            .getByRole("button", { name: right, exact: true })
            .click();
        }
      } else {
        const answer =
          wrong && exercise === 0
            ? q.options.find((x) => x !== q.answer)!
            : q.answer;
        await dialog
          .locator(".answers button")
          .filter({ hasText: answer })
          .click();
      }
      await dialog
        .getByRole("button", { name: "Kiểm tra", exact: true })
        .click();
      await expect(dialog.locator(".feedback")).toContainText(q.explanation);
      exercise++;
    } else if (s.kind === "notebook") {
      await expect(
        dialog.getByRole("button", { name: "Tiếp tục", exact: true }),
      ).toBeDisabled();
      for (const checkbox of await dialog.getByRole("checkbox").all())
        await checkbox.check();
    }
    await dialog.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  }
  await expect(
    page.getByText(
      `Đúng ${demo.questions.length - (wrong ? 1 : 0)}/${demo.questions.length} thử thách`,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lưu kết quả & tiếp tục" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
for (const width of [390, 1440])
  test(`beginner teaching, games, notebook, final test and SRS at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 950 });
    await init(page);
    await page
      .getByRole("button", { name: "Bắt đầu bài học tiếp theo" })
      .click();
    await page.screenshot({
      path: `test-results/beginner-${width}.png`,
      fullPage: true,
    });
    await finishDemo(page, false, width === 1440);
    const p = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("hanzi-quest-v1")!),
    );
    expect(p.completed).toEqual([demo.id]);
    expect(p.reviews["一"].interval).toBe(width === 1440 ? 0 : 1);
    expect(p.reviews["二"].interval).toBe(1);
    expect(p.history).toHaveLength(1);
    await page.reload();
    await page
      .getByRole("button", { name: "Hành trình", exact: true })
      .first()
      .click();
    await expect(page.getByText("Kho 10 bài mẫu cũ · Tùy chọn")).toBeVisible();
    await page.screenshot({
      path: `test-results/path-new-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
test("JSON preview runs every screen and never writes progress", async ({
  page,
}) => {
  await init(page);
  await page
    .getByRole("button", { name: "Hành trình", exact: true })
    .first()
    .click();
  await page
    .getByText("Xem trước giáo trình JSON (không lưu tiến độ)", { exact: true })
    .click();
  await page
    .getByLabel("File giáo trình JSON")
    .setInputFiles("curriculum/beginner.json");
  await page.getByRole("button", { name: /Xem thử: Bước đầu/ }).click();
  await expect(
    page.getByText("XEM TRƯỚC · Không lưu tiến độ, XP hoặc lịch ôn."),
  ).toBeVisible();
  await finishDemo(page, true);
  const p = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hanzi-quest-v1")!),
  );
  expect(p.xp).toBe(0);
  expect(p.completed).toEqual([]);
  expect(p.history).toEqual([]);
});
test("unlearned practice is gated; completing demo offers only its vocabulary", async ({
  page,
}) => {
  await init(page);
  await page
    .getByRole("button", { name: "Luyện tập", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /Flashcard/ }).click();
  await expect(
    page.getByText("Hãy học bài nhập môn trước để có từ ôn tập."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tổng quan", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Bắt đầu bài học tiếp theo" }).click();
  await finishDemo(page);
  await page
    .getByRole("button", { name: "Luyện tập", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /Pinyin/ }).click();
  await page.getByRole("button", { name: "Mình đã hiểu, thử nào" }).click();
  await expect(page.locator(".answers")).toContainText("yī");
  await expect(page.locator(".answers")).toContainText("èr");
  await expect(page.locator(".answers button")).toHaveCount(2);
});
