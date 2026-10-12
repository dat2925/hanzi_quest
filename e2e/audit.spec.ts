import { test as base, expect, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { lessons, allWords, type Question } from "../src/data";
const root = path.resolve("artifacts/audit");
const test = base.extend<{ audit: void }>({
  audit: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      page.setDefaultTimeout(8000);
      const clicks: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.exposeFunction("auditClick", (name: string) =>
        clicks.push(name),
      );
      await page.addInitScript(() =>
        document.addEventListener(
          "click",
          (e) => {
            const b = (e.target as Element)?.closest("button,summary");
            if (b)
              (
                window as unknown as { auditClick: (name: string) => void }
              ).auditClick(
                b.getAttribute("aria-label") ||
                  b.textContent?.trim() ||
                  "unnamed",
              );
          },
          true,
        ),
      );
      await use();
      await mkdir(path.join(root, "controls"), { recursive: true });
      await writeFile(
        path.join(
          root,
          "controls",
          testInfo.title.replace(/[<>:"/\\|?*]/g, "_") + ".json",
        ),
        JSON.stringify(
          { controls: [...new Set(clicks)], runtimeErrors: errors },
          null,
          2,
        ),
      );
      await testInfo.attach("clicked-controls", {
        body: JSON.stringify([...new Set(clicks)], null, 2),
        contentType: "application/json",
      });
      expect(errors, "Unhandled browser errors").toEqual([]);
    },
    { auto: true },
  ],
});
async function nav(page: Page, name: string) {
  await page
    .getByRole("button", { name, exact: true })
    .filter({ visible: true })
    .first()
    .click();
}
async function storage(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("hanzi-quest-v1")!),
  );
}
async function shot(page: Page, folder: string, name: string, fullPage = true) {
  await mkdir(path.join(root, folder), { recursive: true });
  await page.screenshot({
    path: path.join(root, folder, `${name}.png`),
    fullPage,
    animations: "disabled",
  });
}
async function intro(page: Page) {
  await page.getByRole("button", { name: "Mình đã hiểu, thử nào" }).click();
}
async function solve(page: Page, q: Question, wrong = false) {
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: q.prompt, exact: true }),
  ).toBeVisible();
  const check = dialog.getByRole("button", { name: "Kiểm tra", exact: true });
  await expect(check).toBeDisabled();
  if (q.type === "match") {
    const pairs = q.options.map((s) => s.split("|"));
    await dialog
      .getByRole("button", { name: pairs[0][1], exact: true })
      .click();
    await expect(
      dialog.getByText("Chọn một chữ Hán ở bên trái trước nhé."),
    ).toBeVisible();
    if (wrong) {
      await dialog
        .getByRole("button", { name: pairs[0][0], exact: true })
        .click();
      await dialog
        .getByRole("button", { name: pairs[1][1], exact: true })
        .click();
      await expect(dialog.getByText(/Chưa khớp/)).toBeVisible();
    }
    for (const [hanzi, meaning] of pairs) {
      await dialog.getByRole("button", { name: hanzi, exact: true }).click();
      await dialog.getByRole("button", { name: meaning, exact: true }).click();
    }
  } else if (q.type === "sentence") {
    const bank = dialog.locator(".token-bank");
    const options = await bank.getByRole("button").allTextContents();
    await bank.getByRole("button").first().click();
    await dialog.locator(".sentence-answer button").first().click();
    await expect(check).toBeDisabled();
    let remaining = q.answer;
    const order: string[] = [];
    while (remaining) {
      const token = options.find(
        (o) => remaining.startsWith(o) && !order.includes(o),
      );
      if (!token) throw new Error(`Cannot solve ${q.prompt}`);
      order.push(token);
      remaining = remaining.slice(token.length);
    }
    for (const token of wrong ? [...order].reverse() : order)
      await bank.getByRole("button", { name: token, exact: true }).click();
  } else {
    if (q.type === "listen") {
      await dialog
        .getByRole("button", { name: "Nghe phát âm", exact: true })
        .click();
      await dialog.locator("summary").click();
      await expect(dialog.locator("details")).toHaveAttribute("open", "");
    }
    const answer = wrong ? q.options.find((o) => o !== q.answer)! : q.answer;
    await dialog
      .locator(".answers button")
      .filter({
        hasText: new RegExp(
          "^\\d+\\s*" + answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
        ),
      })
      .click();
  }
  await check.click();
  await expect(dialog.locator(".feedback")).toHaveClass(
    wrong ? /incorrect/ : /correct/,
  );
  await dialog.getByRole("button", { name: "Tiếp tục", exact: true }).click();
}
async function finish(page: Page, expected: number, total: number) {
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Viết để ghi nhớ" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Hoàn thành bài học", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Hoàn thành bài học", exact: true })
    .click();
  await expect(
    dialog.getByText(`Đúng ${expected}/${total} thử thách`, { exact: false }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Lưu kết quả & tiếp tục" }).click();
  await expect(dialog).toHaveCount(0);
}
for (const device of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`audit ${device.name}: every lesson, unlocks, mastery and reload`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.setViewportSize(device);
    await page.goto("/");
    await shot(page, device.name, "01-dashboard");
    await shot(page, device.name, "01-dashboard-viewport", false);
    await page.getByRole("button", { name: "Thiết lập hồ sơ" }).click();
    await shot(page, device.name, "02-onboarding", false);
    await page.getByRole("button", { name: "Đóng thiết lập" }).click();
    for (const [index, lesson] of lessons.entries()) {
      await nav(page, "Hành trình");
      if (index < lessons.length - 1) {
        await page
          .getByRole("button", { name: new RegExp(`^${index + 2}\\. `) })
          .click();
        await expect(
          page.getByText("Hoàn thành chặng trước với ít nhất 70%"),
        ).toBeVisible();
        await page.getByRole("button", { name: "Đóng xem trước" }).click();
      }
      if (index === 0) await shot(page, device.name, "03-path");
      await page
        .getByRole("button", { name: new RegExp(`^${index + 1}\\. `) })
        .click();
      await page
        .getByRole("button", { name: "Bắt đầu học", exact: true })
        .click();
      await page.locator(".word-tiles button").first().click();
      await intro(page);
      for (const [i, q] of lesson.questions.entries()) {
        if (index === 0)
          await shot(page, device.name, `04-game-${q.type}`, false);
        await solve(page, q);
      }
      if (index === 0) await shot(page, device.name, "05-writing", false);
      await finish(page, lesson.questions.length, lesson.questions.length);
      await expect
        .poll(async () => (await storage(page)).completed.length)
        .toBe(index + 1);
      await page.reload();
      const p = await storage(page);
      expect(p.completed).toEqual(lessons.slice(0, index + 1).map((l) => l.id));
      expect(p.history).toHaveLength(index + 1);
      expect(p.xp).toBe((index + 1) * 40);
    }
    await nav(page, "Hành trình");
    await page.getByRole("button", { name: /^1\. / }).click();
    await page
      .getByRole("button", { name: "Bắt đầu học", exact: true })
      .click();
    await intro(page);
    for (const q of lessons[0].questions) await solve(page, q);
    await finish(page, 4, 4);
    await expect(
      page.getByRole("button", { name: /^1\. .*Đã thành thạo/ }),
    ).toBeVisible();
    expect((await storage(page)).completed).toHaveLength(10);
    expect((await storage(page)).xp).toBe(410);
    await nav(page, "Sổ tay");
    await shot(page, device.name, "06-notebook");
    await nav(page, "Thống kê");
    await shot(page, device.name, "07-statistics");
    await nav(page, "Cài đặt");
    await shot(page, device.name, "08-settings");
    await page.getByRole("switch", { name: "Giao diện tối" }).click();
    await nav(page, "Tổng quan");
    await shot(page, device.name, "09-dark-dashboard");
  });
}
for (const mode of [
  "Nghe",
  "Pinyin",
  "Thanh điệu",
  "Nhận diện chữ Hán",
  "Ghép cặp",
  "Sắp xếp câu",
  "Ôn lỗi sai",
  "Ôn tập đến hạn",
]) {
  test(`audit practice: ${mode}`, async ({ page }) => {
    await page.goto("/");
    if (["Ôn lỗi sai", "Ôn tập đến hạn"].includes(mode)) {
      // Isolated browser fixture to trigger a due review without waiting 10 minutes.
      await page.evaluate(() => {
        const p = JSON.parse(localStorage.getItem("hanzi-quest-v1")!);
        p.difficult = ["茶"];
        p.reviews = {
          茶: { due: Date.now() - 60000, interval: 0, attempts: 1, correct: 0 },
        };
        localStorage.setItem("hanzi-quest-v1", JSON.stringify(p));
      });
      await page.reload();
    }
    await nav(page, "Luyện tập");
    await shot(page, "desktop", "10-practice");
    if (mode === "Ôn tập đến hạn")
      await page.getByRole("button", { name: "Ôn ngay", exact: true }).click();
    else
      await page
        .locator(".practice-grid button")
        .filter({ has: page.getByRole("heading", { name: mode, exact: true }) })
        .click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("heading", { name: mode, exact: true }),
    ).toBeVisible();
    await intro(page);
    const selected = ["Ôn lỗi sai", "Ôn tập đến hạn"].includes(mode)
      ? allWords.filter((w) => w.hanzi === "茶")
      : allWords.slice(0, 6);
    const qs: Question[] =
      mode === "Thanh điệu"
        ? lessons[2].questions
        : mode === "Ghép cặp"
          ? [lessons[0].questions[2]]
          : mode === "Sắp xếp câu"
            ? [lessons[0].questions[3], lessons[6].questions[1]]
            : selected.map((w) => ({
                type: mode === "Nghe" ? "listen" : "quiz",
                prompt:
                  mode === "Nghe"
                    ? "Nghe và chọn chữ Hán"
                    : mode === "Pinyin"
                      ? `Pinyin của ${w.hanzi} là gì?`
                      : `“${w.hanzi}” có nghĩa là gì?`,
                answer:
                  mode === "Nghe"
                    ? w.hanzi
                    : mode === "Pinyin"
                      ? w.pinyin
                      : w.meaning,
                options: [],
                explanation: "",
              }));
    for (const q of qs) await solve(page, q);
    await finish(page, qs.length, qs.length);
    const p = await storage(page);
    expect(p.completed).toEqual([]);
    expect(p.history).toHaveLength(1);
    if (["Ôn lỗi sai", "Ôn tập đến hạn"].includes(mode))
      expect(p.reviews["茶"].due).toBeGreaterThan(Date.now() + 23 * 3600000);
    if (mode === "Thanh điệu") {
      expect(Object.keys(p.reviews).sort()).toEqual(["妈", "马", "骂"].sort());
      expect(p.reviews["你好"]).toBeUndefined();
    }
    await page.reload();
    expect((await storage(page)).xp).toBe(40);
  });
}
test("audit failure: incorrect answers, matching retry, no unlock and short review", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bắt đầu bài học tiếp theo" }).click();
  await intro(page);
  for (const q of lessons[0].questions) await solve(page, q, true);
  await finish(page, 0, 4);
  const p = await storage(page);
  expect(p.completed).toEqual([]);
  expect(p.history[0].accuracy).toBe(0);
  expect(p.difficult).toContain("谢谢");
  expect(p.reviews["谢谢"].due).toBeLessThan(Date.now() + 11 * 60000);
  await page.reload();
  expect((await storage(page)).completed).toEqual([]);
});
test("audit controls: profile, all navigation/CTAs, notebook, flashcards, canvas, settings/export", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  for (const label of [
    "Bắt đầu hành trình",
    "★ Tiếng Trung",
    "Thiết lập hồ sơ",
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Đóng thiết lập" }).click();
  }
  await page.getByRole("button", { name: "Thiết lập hồ sơ" }).click();
  await page.getByLabel("Tên của bạn").fill("Kiểm thử");
  await page
    .getByLabel("Bạn đã biết tiếng Trung chưa?")
    .selectOption("Đã biết một chút");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  for (const goal of ["Học cơ bản", "HSK 1", "HSK 2", "HSK 3"])
    await page.getByRole("button", { name: goal, exact: true }).click();
  await page.getByRole("button", { name: "Quay lại", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  for (const n of [15, 30, 60, 120])
    await page
      .getByRole("button", { name: `${n} phút/ngày`, exact: true })
      .click();
  await page.getByLabel("Giờ học mong muốn").fill("19:30");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Bắt đầu hành trình", exact: true })
    .click();
  await page.getByRole("button", { name: "Đóng thông báo" }).click();
  await page.reload();
  expect(await storage(page)).toMatchObject({
    name: "Kiểm thử",
    daily: 120,
    goal: "HSK 3",
    time: "19:30",
    experience: "Đã biết một chút",
  });
  for (const label of [
    "Tiếp tục học",
    "Bắt đầu bài học tiếp theo",
    "Học từ đầu tiên",
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Đóng bài học" }).click();
  }
  for (const label of ["Xem hành trình", "Xem bản đồ học tập"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Hành trình của bạn" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Học bài tiếp theo", exact: true })
      .click();
    await page.getByRole("button", { name: "Đóng bài học" }).click();
    await page
      .getByRole("button", { name: "Hanzi Quest, về tổng quan" })
      .click();
  }
  for (const label of [
    "Khám phá tất cả",
    "Nghe & nhận diện",
    "Ghép cặp từ vựng",
    "Nét chữ đầu tiên",
    "Mở sổ tay",
  ]) {
    await page.getByRole("button", { name: new RegExp("^" + label) }).click();
    if (await page.getByRole("dialog").count())
      await page.getByRole("button", { name: "Đóng bài học" }).click();
    await nav(page, "Tổng quan");
  }
  await nav(page, "Luyện tập");
  await expect(
    page.getByRole("button", { name: "Ôn ngay", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .locator(".practice-grid button")
      .filter({
        has: page.getByRole("heading", { name: "Ôn lỗi sai", exact: true }),
      }),
  ).toBeDisabled();
  await page
    .locator(".practice-grid button")
    .filter({
      has: page.getByRole("heading", { name: "Flashcard", exact: true }),
    })
    .click();
  await page.getByRole("button", { name: "Lật thẻ" }).click();
  await page.getByRole("button", { name: "Cần ôn thêm", exact: true }).click();
  await page.getByRole("button", { name: "Đã nhớ · Thẻ tiếp" }).click();
  await page.getByRole("button", { name: "Đóng flashcard" }).click();
  await nav(page, "Sổ tay");
  await page.getByLabel("Tìm từ vựng").fill("你好");
  await expect(page.locator(".word-row")).toHaveCount(1);
  await page.getByLabel("Tìm từ vựng").fill("không có");
  await expect(page.getByText("Chưa tìm thấy từ phù hợp.")).toBeVisible();
  await page.getByLabel("Tìm từ vựng").fill("");
  await page.getByRole("button", { name: "Nghe 你好", exact: true }).click();
  await page.getByRole("button", { name: "Bỏ đánh dấu 你好" }).click();
  await page.getByRole("button", { name: "Đánh dấu khó 你好" }).click();
  await page.getByRole("button", { name: "Từ khó", exact: true }).click();
  await expect(page.locator(".word-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Ngữ pháp", exact: true }).click();
  await expect(page.getByText("Mẫu câu trong hành trình")).toBeVisible();
  await page.getByRole("button", { name: "Lịch sử ôn", exact: true }).click();
  await expect(
    page.getByText("Chưa có buổi học nào.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Từ đã học", exact: true }).click();
  await page
    .getByLabel("Ghi chú cá nhân")
    .fill("Ghi chú kiểm thử — giữ sau tải lại");
  await page.getByRole("checkbox").check();
  await page.reload();
  await nav(page, "Sổ tay");
  await expect(page.getByLabel("Ghi chú cá nhân")).toHaveValue(
    "Ghi chú kiểm thử — giữ sau tải lại",
  );
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.getByRole("checkbox").uncheck();
  await nav(page, "Luyện tập");
  await page
    .locator(".practice-grid button")
    .filter({
      has: page.getByRole("heading", { name: "Luyện viết", exact: true }),
    })
    .click();
  const canvas = page.locator("canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + 50, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText("1 nét thử", { exact: false })).toBeVisible();
  expect(
    await canvas.evaluate((el) =>
      el
        .getContext("2d")!
        .getImageData(0, 0, 320, 320)
        .data.some((v, i) => i % 4 === 3 && v > 0),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Viết lại", exact: true }).click();
  expect(
    await canvas.evaluate((el) =>
      el
        .getContext("2d")!
        .getImageData(0, 0, 320, 320)
        .data.every((v) => v === 0),
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Mình đã luyện viết vào vở", exact: true })
    .click();
  await page.getByRole("button", { name: "Đóng luyện viết" }).click();
  await nav(page, "Thống kê");
  await page.getByRole("button", { name: "Xem những từ cần ôn" }).click();
  await expect(
    page.getByRole("heading", { name: "Sổ tay của bạn" }),
  ).toBeVisible();
  await nav(page, "Cài đặt");
  await page.getByRole("button", { name: "Điều chỉnh", exact: true }).click();
  await page.getByRole("button", { name: "Đóng thiết lập" }).click();
  await page.getByRole("switch", { name: "Giao diện tối" }).click();
  await page.getByRole("switch", { name: "Âm thanh phát âm" }).click();
  await page.reload();
  expect(await storage(page)).toMatchObject({ dark: true, sound: false });
  await nav(page, "Cài đặt");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất tiến độ JSON" }).click();
  const download = await pending;
  const output = path.join(root, "progress-export-test.json");
  await download.saveAs(output);
  expect(JSON.parse(await readFile(output, "utf8"))).toEqual(
    await storage(page),
  );
  await nav(page, "Sổ tay");
  await page.getByRole("button", { name: "Nghe 你好", exact: true }).click();
  await expect(
    page.getByText("Âm thanh đang tắt.", { exact: false }),
  ).toBeVisible();
});
test("audit reload during an unfinished lesson does not invent completion", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bắt đầu bài học tiếp theo" }).click();
  await intro(page);
  await solve(page, lessons[0].questions[0]);
  await page.reload();
  const p = await storage(page);
  expect(p.xp).toBe(0);
  expect(p.history).toEqual([]);
  expect(p.completed).toEqual([]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("audit audio availability in installed browser", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const voices = await page.evaluate(async () => {
    await new Promise<void>((r) => setTimeout(r, 500));
    return typeof speechSynthesis === "undefined"
      ? null
      : speechSynthesis
          .getVoices()
          .map((v) => ({ name: v.name, lang: v.lang }));
  });
  await testInfo.attach("real-installed-voices", {
    body: JSON.stringify(voices, null, 2),
    contentType: "application/json",
  });
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, "installed-browser-voices.json"),
    JSON.stringify(voices, null, 2),
  );
});
