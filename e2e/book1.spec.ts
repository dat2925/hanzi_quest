import { test, expect, type Page } from "@playwright/test";
import { initial } from "../src/progress";
import { lesson1a } from "../src/learning/book1";
async function open(page: Page) {
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
    .getByRole("button", { name: "Xem thử Bài 1A · 你好 – Xin chào" })
    .click();
}
async function recall(page: Page) {
  for (let i = 0; i < 5; i++) {
    const card = page.getByRole("region", { name: "Thẻ tự nhớ" });
    await expect(card.getByTestId("recall-answer")).toHaveCount(0);
    await expect(
      card.getByRole("button", { name: "Nhớ được", exact: true }),
    ).toHaveCount(0);
    if (i === 1) await expect(card).not.toContainText("你好");
    await card
      .getByRole("button", { name: "Mình đã thử nhớ · Xem đáp án" })
      .click();
    await expect(card.getByTestId("recall-answer")).toBeVisible();
    await card.getByRole("button", { name: "Nhớ được", exact: true }).click();
  }
}
for (const width of [390, 1440])
  test(`1A seven stages, hidden recall, writing, mistakes and safe preview at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page);
    const d = page.getByRole("dialog");
    const next = () =>
      d.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await expect(
      d.getByRole("heading", { name: "1/7 · Lời chào đầu tiên" }),
    ).toBeVisible();
    await expect(d.locator(".answers")).toHaveCount(0);
    await next();
    await d.getByRole("button", { name: "Ẩn Pinyin", exact: true }).click();
    await expect(d.locator(".word-tiles")).not.toContainText("nǐ");
    await d.getByRole("button", { name: "Hiện Pinyin", exact: true }).click();
    await expect(d.locator(".word-tiles")).toContainText("nǐ");
    expect(
      await d
        .locator(".game-body")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await d.screenshot({ path: `artifacts/book1-words-${width}.png` });
    await next();
    await d.getByRole("button", { name: "Nghe chậm", exact: true }).click();
    await d.getByRole("button", { name: "Ẩn Pinyin", exact: true }).click();
    await expect(d).not.toContainText("nǐ");
    await next();
    await expect(
      d.getByRole("button", { name: "Tiếp tục", exact: true }),
    ).toBeDisabled();
    await recall(page);
    await next();
    await expect(
      d.getByRole("button", { name: "Tiếp tục", exact: true }),
    ).toBeDisabled();
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
        await d.getByRole("button", { name: "好", exact: true }).click();
        await d.getByRole("button", { name: "你", exact: true }).click();
      } else
        await d
          .locator(".answers button")
          .filter({
            hasText: new RegExp(
              `^\\d+${q.options.find((o) => o !== q.answer)!}$`,
            ),
          })
          .click();
      await d.getByRole("button", { name: "Kiểm tra", exact: true }).click();
      await expect(d.locator(".feedback")).toContainText(q.explanation);
      await next();
    }
    await expect(
      d.getByRole("heading", { name: "7/7 · Nhớ lâu bằng những lần ôn ngắn" }),
    ).toBeVisible();
    await expect(
      d.getByRole("button", { name: "Tiếp tục", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: `test-results/book1-${width}.png`,
      fullPage: true,
    });
    await d
      .getByRole("button", { name: "Tự nhớ lại trước khi kết thúc" })
      .click();
    await recall(page);
    await next();
    await expect(d).toContainText("Đúng 1/5");
    await d.getByRole("button", { name: "Lưu kết quả & tiếp tục" }).click();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("hanzi-quest-v1")!),
    );
    expect(saved.xp).toBe(0);
    expect(saved.reviews).toEqual({});
    expect(saved.completed).toEqual([]);
    expect(errors).toEqual([]);
  });

test("Mandarin TTS skips Cantonese and uses slow rate; missing Mandarin reports honestly", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).SpeechSynthesisUtterance = class {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    };
    const synth = window.speechSynthesis;
    Object.defineProperty(synth, "getVoices", {
      configurable: true,
      value: () => [
        { lang: "zh-HK", name: "Cantonese" },
        { lang: "en-US", name: "English" },
        { lang: "zh-CN", name: "Mandarin" },
      ],
    });
    Object.defineProperty(synth, "speak", {
      value: (u: SpeechSynthesisUtterance) => {
        (window as any).spoken = {
          lang: u.voice?.lang,
          rate: u.rate,
          text: u.text,
        };
      },
    });
  });
  await open(page);
  const d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await d.getByRole("button", { name: "Nghe chậm 你好", exact: true }).click();
  expect(await page.evaluate(() => (window as any).spoken)).toEqual({
    lang: "zh-CN",
    rate: 0.5,
    text: "你好",
  });
  await page.evaluate(() =>
    Object.defineProperty(window.speechSynthesis, "getVoices", {
      value: () => [{ lang: "zh-HK" }],
    }),
  );
  await d.getByRole("button", { name: "Nghe chậm 你好", exact: true }).click();
  await expect(d.getByRole("status")).toContainText("chưa có giọng");
});
