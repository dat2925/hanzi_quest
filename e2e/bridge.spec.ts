import { test, expect } from "@playwright/test";
test("MCP Apps handshake, host theme, tool-result preview and keyboard focus isolation", async ({
  page,
}) => {
  await page.setContent(
    `<script>window.auditModes=[];window.addEventListener('message',e=>{const m=e.data;if(m?.method==='ui/initialize')e.source.postMessage({jsonrpc:'2.0',id:m.id,result:{protocolVersion:m.params.protocolVersion,hostInfo:{name:'Test Host',version:'1.0.0'},hostCapabilities:{},hostContext:{theme:'dark',displayMode:'inline',availableDisplayModes:['inline','fullscreen']}}},'*');if(m?.method==='ui/request-display-mode'){window.auditModes.push(m.params.mode);e.source.postMessage({jsonrpc:'2.0',id:m.id,result:{mode:m.params.mode}},'*');}});</script><iframe title="Learning app" src="${process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8787"}" style="width:100%;height:900px"></iframe>`,
  );
  const frame = page.frameLocator("iframe");
  await expect(
    frame.getByRole("button", { name: "Mở toàn màn hình" }),
  ).toBeVisible();
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");
  await frame.getByRole("button", { name: "Mở toàn màn hình" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { auditModes: string[] }).auditModes,
      ),
    )
    .toEqual(["fullscreen"]);
  await page.evaluate(() => {
    const target = document.querySelector("iframe")!.contentWindow!;
    target.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/host-context-changed",
        params: { theme: "light" },
      },
      "*",
    );
    target.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: { content: [], structuredContent: { lessonId: "pinyin" } },
      },
      "*",
    );
  });
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(frame.getByRole("dialog")).toBeVisible();
  await expect(
    frame.getByText("Hoàn thành các bài tiên quyết với ít nhất 70%"),
  ).toBeVisible();
  await frame.getByRole("button", { name: "Đóng xem trước" }).focus();
  await page.keyboard.press("Tab");
  await expect(
    frame.getByRole("button", { name: "Đóng xem trước" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(frame.getByRole("dialog")).toHaveCount(0);
});
