import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
const client = new Client({ name: "hanzi-quest-test", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL((process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8787")+"/mcp")),
);
const tools = await client.listTools();
assert.equal(tools.tools.length, 3);
const open = await client.callTool({ name: "open_hanzi_quest", arguments: {} });
assert.ok(!open.isError);
const lesson = await client.callTool({
  name: "preview_lesson",
  arguments: { lessonId: "hello" },
});
assert.equal(
  (lesson.structuredContent as { lessonId: string }).lessonId,
  "hello",
);
const invalid = await client.callTool({
  name: "preview_lesson",
  arguments: { lessonId: "invalid" },
});
assert.equal(invalid.isError, true);
const resources = await client.listResources();
assert.equal(resources.resources[0].mimeType, "text/html;profile=mcp-app");
const content = await client.readResource({ uri: resources.resources[0].uri });
assert.ok(
  "text" in content.contents[0] &&
    content.contents[0].text.includes("Hanzi Quest"),
);
assert.ok(
  "text" in content.contents[0] &&
    !content.contents[0].text.includes('src="/assets/'),
);
await client.close();
console.log(
  "MCP smoke passed: initialize, list tools, call tools, validation, list/read embedded UI resource.",
);
