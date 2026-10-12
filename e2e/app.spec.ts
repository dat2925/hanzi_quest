import { test, expect } from "@playwright/test";
test("onboarding, all game mechanics, completion, notebook and persistence", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Chào bạn, cùng học thôi!" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bắt đầu hành trình", exact: true })
    .click();
  await page.getByLabel("Tên của bạn").fill("Linh");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("button", { name: "HSK 2", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page
    .getByRole("button", { name: "Bắt đầu hành trình", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Chào Linh, cùng học thôi!" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hành trình", exact: true })
    .first()
    .click();
  await page.getByText("Kho 10 bài mẫu cũ · Tùy chọn", { exact: true }).click();
  await page
    .getByRole("button", { name: /你好! Xin chào, tiếng Trung · Có thể học/ })
    .click();
  await page.getByRole("button", { name: "Bắt đầu học", exact: true }).click();
  await page.getByRole("button", { name: "Mình đã hiểu, thử nào" }).click();
  await page.screenshot({ path: "test-results/game.png", fullPage: true });
  await page.getByRole("button", { name: /^\d+ 你好$/ }).click();
  await page.getByRole("button", { name: "Kiểm tra", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("button", { name: /^\d+ 谢谢$/ }).click();
  await page.getByRole("button", { name: "Kiểm tra", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  for (const [hanzi, meaning] of [
    ["你好", "Xin chào"],
    ["谢谢", "Cảm ơn"],
    ["再见", "Tạm biệt"],
  ]) {
    await page.getByRole("button", { name: hanzi, exact: true }).click();
    await page.getByRole("button", { name: meaning, exact: true }).click();
  }
  await page.getByRole("button", { name: "Kiểm tra", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  const bank = page.locator(".token-bank");
  for (const token of ["我", "是", "学生"])
    await bank.getByRole("button", { name: token, exact: true }).click();
  await page.getByRole("button", { name: "Kiểm tra", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Hoàn thành bài học", exact: true })
    .click();
  await expect(page.getByText("Đúng 4/4 thử thách")).toBeVisible();
  await page.getByRole("button", { name: "Lưu kết quả & tiếp tục" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Chào Linh, cùng học thôi!" }),
  ).toBeVisible();
  const progress = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hanzi-quest-v1")!),
  );
  expect(progress.xp).toBe(40);
  expect(progress.completed).toEqual(["hello"]);
  await page
    .getByRole("button", { name: "Sổ tay", exact: true })
    .first()
    .click();
  await page.getByLabel("Ghi chú cá nhân").fill("Nhớ thanh điệu");
  await page.reload();
  await page
    .getByRole("button", { name: "Sổ tay", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Ghi chú cá nhân")).toHaveValue(
    "Nhớ thanh điệu",
  );
});
test("locked preview, dark mode, flashcards and all pages render", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Hành trình", exact: true })
    .first()
    .click();
  await page.getByText("Kho 10 bài mẫu cũ · Tùy chọn", { exact: true }).click();
  await page
    .getByRole("button", { name: /Pinyin · Chiếc chìa khóa phát âm/ })
    .click();
  await expect(
    page.getByText("Hoàn thành các bài tiên quyết với ít nhất 70%"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Đóng xem trước" }).click();
  for (const name of ["Luyện tập", "Sổ tay", "Thống kê", "Cài đặt"])
    await page.getByRole("button", { name, exact: true }).first().click();
  await page.getByRole("switch", { name: "Giao diện tối" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "test-results/dark-mode.png", fullPage: true });
  await page
    .getByRole("button", { name: "Luyện tập", exact: true })
    .first()
    .click();
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("hanzi-quest-v1")!);
    p.reviews = {
      你好: {
        due: Date.now() + 86400000,
        interval: 1,
        attempts: 1,
        correct: 1,
      },
      谢谢: {
        due: Date.now() + 86400000,
        interval: 1,
        attempts: 1,
        correct: 1,
      },
    };
    localStorage.setItem("hanzi-quest-v1", JSON.stringify(p));
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Luyện tập", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /Flashcard/ }).click();
  await page.getByRole("button", { name: "Lật thẻ" }).click();
  await expect(page.getByText("nǐ hǎo · Xin chào")).toBeVisible();
  await page.getByRole("button", { name: "Đã nhớ · Thẻ tiếp" }).click();
  await expect(page.getByText(/2\/\d+ thẻ/)).toBeVisible();
});
test("320, 390, 768 and 1440 pixel layouts have no horizontal overflow", async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.screenshot({
      path: `test-results/dashboard-${width}.png`,
      fullPage: true,
    });
    for (const name of [
      "Tổng quan",
      "Hành trình",
      "Luyện tập",
      "Sổ tay",
      "Thống kê",
      "Cài đặt",
    ]) {
      await page
        .getByRole("button", { name, exact: true })
        .filter({ visible: true })
        .first()
        .click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  }
});
