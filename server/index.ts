import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { lessons, stages } from "../src/data.js";
const resourceUri = "ui://hanzi-quest/app.html";
const htmlPath = fileURLToPath(new URL("../dist/index.html", import.meta.url));
export function makeServer() {
  const server = new McpServer({ name: "hanzi-quest", version: "1.0.0" });
  registerAppResource(server, "hanzi-quest-ui", resourceUri, {}, async () => ({
    contents: [
      {
        uri: resourceUri,
        mimeType: RESOURCE_MIME_TYPE,
        text: readFileSync(htmlPath, "utf8"),
        _meta: {
          ui: {
            prefersBorder: false,
            csp: {
              resourceDomains: [
                "https://fonts.googleapis.com",
                "https://fonts.gstatic.com",
              ],
            },
          },
        },
      },
    ],
  }));
  registerAppTool(
    server,
    "open_hanzi_quest",
    {
      title: "Open Hanzi Quest",
      description:
        "Open the Vietnamese-language Chinese learning application. Progress is browser-local and not available to this server.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri } },
    },
    async () => ({
      content: [
        {
          type: "text" as const,
          text: "Hanzi Quest mở ra hành trình 10 bài mẫu từ nhập môn đến HSK 3. Tiến độ lưu ở trình duyệt; server không đọc hoặc tự đánh dấu hoàn thành.",
        },
      ],
      structuredContent: {
        stages: stages.map((title, i) => ({ title, lessonId: lessons[i].id })),
      },
    }),
  );
  server.registerTool(
    "get_learning_path",
    {
      title: "Get learning path",
      description:
        "Read the introductory Chinese curriculum and sample HSK 1–3 lessons. This is not a complete HSK course.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => ({
      content: [
        {
          type: "text" as const,
          text: lessons
            .map((l, i) => `${i + 1}. ${l.title} (${l.minutes} phút)`)
            .join("\n"),
        },
      ],
      structuredContent: {
        lessons: lessons.map(({ id, title, description, minutes }) => ({
          id,
          title,
          description,
          minutes,
        })),
      },
    }),
  );
  registerAppTool(
    server,
    "preview_lesson",
    {
      title: "Preview Chinese lesson",
      description:
        "Preview lesson content in Hanzi Quest. Does not grant progress or unlock lessons.",
      inputSchema: z.object({
        lessonId: z.enum(lessons.map((l) => l.id) as [string, ...string[]]),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri } },
    },
    async ({ lessonId }) => {
      const l = lessons.find((x) => x.id === lessonId)!;
      return {
        content: [
          {
            type: "text" as const,
            text: `${l.title}\n${l.guide}\nLuyện viết: ${l.writing}`,
          },
        ],
        structuredContent: { lessonId, lesson: l },
      };
    },
  );
  return server;
}
const port = Number(process.env.MCP_PORT || 8787);
const http = createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", `http://localhost:${port}`).pathname;
  if (req.method === "GET" && pathname === "/health") {
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ status: "ok", application: "hanzi-quest" }));
    return;
  }
  if (req.method === "GET" && pathname === "/") {
    try {
      res
        .writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        })
        .end(readFileSync(htmlPath));
    } catch {
      res.writeHead(503).end("Run npm run build first.");
    }
    return;
  }
  if (pathname === "/mcp" && req.method === "POST") {
    const server = makeServer();
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!res.headersSent) res.writeHead(500).end("MCP request failed");
    }
    return;
  }
  res
    .writeHead(pathname === "/mcp" ? 405 : 404)
    .end(
      pathname === "/mcp" ? "Stateless MCP: POST requests only" : "Not found",
    );
});
http.listen(port, "127.0.0.1", () =>
  console.log(
    `Hanzi Quest: http://127.0.0.1:${port} · MCP: http://127.0.0.1:${port}/mcp`,
  ),
);
