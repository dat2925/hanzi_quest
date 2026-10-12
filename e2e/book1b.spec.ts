import { test, expect } from "@playwright/test";
import { initial } from "../src/progress";
import { lesson1b } from "../src/learning/book1b";

for (const width of [390, 1440])
  test(`1B seven stages and six checks, hidden recall/model, no preview XP at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(
      (p) => localStorage.setItem("hanzi-quest-v1", JSON.stringify(p)),
      { ...initial, onboarded: true },
    );
    await page.goto("/");
    await page
      .getByRole("button", { name: "Hành trình", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Xem thử Bài 1B · Làm quen với Pinyin" })
      .click();
    const d = page.getByRole("dialog");
    const next = () =>
      d.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await expect(d).toContainText("1/7 · Pinyin được ghép như thế nào?");
    await expect(d.locator(".answers")).toHaveCount(0);
    await next();
    await expect(d).toContainText("2/7 · Bốn thanh mẫu, hai vận mẫu");
    await expect(d).toContainText("bật hơi");
    await expect(d).toContainText("tờ giấy");
    await d.screenshot({ path: `artifacts/book1b-pronunciation-${width}.png` });
    expect(
      await d
        .locator(".game-body")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await next();
    await expect(d).toContainText("3/7 · Hai chữ đầu tiên để ghép âm");
    await d.getByRole("button", { name: "Ẩn Pinyin", exact: true }).click();
    await expect(d).not.toContainText("bā");
    await expect(d).not.toContainText("mǎ");
    await next();
    await expect(
      d.getByRole("button", { name: "Tiếp tục", exact: true }),
    ).toBeDisabled();
    for (let i = 0; i < 6; i++) {
      const card = d.getByRole("region", { name: "Thẻ tự nhớ" });
      await expect(card.getByTestId("recall-answer")).toHaveCount(0);
      if (i === 2 || i === 3)
        await expect(card.locator("h3")).not.toContainText(/八|马/);
      await card
        .getByRole("button", { name: "Mình đã thử nhớ · Xem đáp án" })
        .click();
      await expect(card.getByTestId("recall-answer")).toBeVisible();
      await card.getByRole("button", { name: "Nhớ được", exact: true }).click();
    }
    await next();
    await expect(d).toContainText("5/7 · Viết vào vở để nhớ mặt chữ");
    await d.getByRole("button", { name: "Che mẫu để tự viết" }).click();
    await expect(d.locator(".lesson-example")).toHaveCount(0);
    await expect(d.locator(".game-body")).not.toContainText(/八|马|bā|mǎ/);
    await d.getByRole("button", { name: "Hiện mẫu để đối chiếu" }).click();
    await expect(d.locator(".lesson-example")).toHaveCount(2);
    for (const c of await d.getByRole("checkbox").all()) await c.check();
    await next();
    for (const [i, q] of lesson1b.questions.entries()) {
      await expect(
        d.getByRole("heading", { name: q.prompt, exact: true }),
      ).toBeVisible();
      if (q.type === "match") {
        for (const pair of q.options) {
          const [a, b] = pair.split("|");
          await d.getByRole("button", { name: a, exact: true }).click();
          await d.getByRole("button", { name: b, exact: true }).click();
        }
      } else {
        const answer = i === 2 ? "b" : q.answer; // Deliberately confuse aspiration once.
        await d
          .locator(".answers button")
          .filter({ hasText: new RegExp(`^\\d+${answer}$`) })
          .click();
      }
      await d.getByRole("button", { name: "Kiểm tra", exact: true }).click();
      await expect(d.locator(".feedback")).toContainText(q.explanation);
      await next();
    }
    await expect(d).toContainText("7/7 · Hẹn lần gặp lại");
    await next();
    await expect(d).toContainText("Đúng 5/6");
    await d.getByRole("button", { name: "Lưu kết quả & tiếp tục" }).click();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("hanzi-quest-v1")!),
    );
    expect(saved.xp).toBe(0);
    expect(saved.completed).toEqual([]);
    expect(saved.reviews).toEqual({});
  });
