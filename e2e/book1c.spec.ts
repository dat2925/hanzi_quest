import { test, expect, type Page } from "@playwright/test";
import { initial } from "../src/progress";
import { lesson1c } from "../src/learning/book1c";

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
    .getByRole("button", {
      name: "Xem thử Bài 1C · Bốn thanh điệu tiếng Trung",
    })
    .click();
}

for (const width of [390, 1440])
  test(`1C seven stages, six hidden recall cards, nine checks and no preview progress at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page);
    const d = page.getByRole("dialog");
    const next = () =>
      d.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    const layout = async () =>
      expect(
        await d
          .locator(".game-body")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    await expect(d).toContainText("1/7 · Một âm, nhiều thanh điệu");
    await expect(d.locator(".answers")).toHaveCount(0);
    await next();
    await expect(d).toContainText("2/7 · Nghe bốn thanh điệu");
    await expect(d).toContainText("khi nói liền thường chỉ thấp");
    await expect(d.locator(".lesson-example")).toHaveCount(4);
    await expect(d.getByRole("button", { name: /^Nghe ví dụ/ })).toHaveCount(4);
    await layout();
    await d.screenshot({ path: `artifacts/book1c-tones-${width}.png` });
    await d.getByRole("button", { name: "Ẩn Pinyin", exact: true }).click();
    await expect(d).not.toContainText("mā");
    await next();
    await expect(d).toContainText("3/7 · Hai từ mới: mẹ và bố");
    await expect(d.locator(".word-tiles > div")).toHaveCount(2);
    await expect(d.locator(".lesson-example")).toContainText(["八", "马"]);
    await d.getByRole("button", { name: "Ẩn Pinyin", exact: true }).click();
    for (const pinyin of ["mā", "bà", "bā", "mǎ"])
      await expect(d).not.toContainText(pinyin);
    await layout();
    await d.screenshot({ path: `artifacts/book1c-words-${width}.png` });
    await next();
    await expect(
      d.getByRole("button", { name: "Tiếp tục", exact: true }),
    ).toBeDisabled();
    for (let i = 0; i < 6; i++) {
      const card = d.getByRole("region", { name: "Thẻ tự nhớ" });
      await expect(card.getByTestId("recall-answer")).toHaveCount(0);
      await expect(
        card.getByRole("button", { name: "Nhớ được", exact: true }),
      ).toHaveCount(0);
      if (i === 2 || i === 3)
        await expect(card.locator("h3")).not.toContainText(/妈|爸/);
      await card
        .getByRole("button", { name: "Mình đã thử nhớ · Xem đáp án" })
        .click();
      await expect(card.getByTestId("recall-answer")).toBeVisible();
      await card
        .getByRole("button", {
          name: i === 0 ? "Chưa nhớ" : "Nhớ được",
          exact: true,
        })
        .click();
    }
    await next();
    await expect(d).toContainText("5/7 · Ghi dấu thanh và viết vào vở");
    await expect(
      d.getByRole("button", { name: "Tiếp tục", exact: true }),
    ).toBeDisabled();
    await d.getByRole("button", { name: "Che mẫu để tự viết" }).click();
    await expect(d.locator(".lesson-example")).toHaveCount(0);
    await expect(d.locator(".game-body")).not.toContainText(/妈|爸|mā/);
    await d.getByRole("button", { name: "Hiện mẫu để đối chiếu" }).click();
    await expect(d.locator(".lesson-example")).toHaveCount(2);
    for (const c of await d.getByRole("checkbox").all()) await c.check();
    await layout();
    await next();
    for (const [i, q] of lesson1c.questions.entries()) {
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
        const selection =
          i === 3 ? q.options.find((o) => o !== q.answer)! : q.answer;
        await d
          .locator(".answers button")
          .filter({ hasText: new RegExp(`^\\d+${selection}$`) })
          .click();
      }
      await d.getByRole("button", { name: "Kiểm tra", exact: true }).click();
      await expect(d.locator(".feedback")).toContainText(q.explanation);
      await next();
    }
    await expect(d).toContainText("7/7 · Lên lịch ôn hai từ mới");
    await expect(d).toContainText("Những chỗ cần ôn lại");
    await next();
    await expect(d).toContainText("Đúng 8/9");
    await d.getByRole("button", { name: "Lưu kết quả & tiếp tục" }).click();
    await page.reload();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("hanzi-quest-v1")!),
    );
    expect(saved.xp).toBe(0);
    expect(saved.completed).toEqual([]);
    expect(saved.reviews).toEqual({});
    expect(errors).toEqual([]);
  });

test("1C plays each tone separately using Mandarin only and reports missing voices", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).spoken = [];
    (window as any).SpeechSynthesisUtterance = class {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    };
    Object.defineProperty(window.speechSynthesis, "getVoices", {
      configurable: true,
      value: () => [{ lang: "en-US" }, { lang: "zh-HK" }, { lang: "zh-SG" }],
    });
    Object.defineProperty(window.speechSynthesis, "speak", {
      value: (u: SpeechSynthesisUtterance) =>
        (window as any).spoken.push({
          text: u.text,
          lang: u.voice?.lang,
          rate: u.rate,
        }),
    });
  });
  await open(page);
  const d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  for (let i = 1; i <= 4; i++)
    await d
      .getByRole("button", { name: `Nghe chậm ví dụ ${i}`, exact: true })
      .click();
  expect(await page.evaluate(() => (window as any).spoken)).toEqual(
    ["妈", "麻", "马", "骂"].map((text) => ({
      text,
      lang: "zh-SG",
      rate: 0.5,
    })),
  );
  await page.evaluate(() =>
    Object.defineProperty(window.speechSynthesis, "getVoices", {
      value: () => [{ lang: "en-US" }, { lang: "zh-HK" }],
    }),
  );
  await d.getByRole("button", { name: "Nghe ví dụ 1", exact: true }).click();
  await expect(d.getByRole("status")).toContainText("chưa có giọng");
  expect(await page.evaluate(() => (window as any).spoken.length)).toBe(4);
});
