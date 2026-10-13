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
import { createCurriculumAdminHandler } from "./admin";
import { createPlatformAdminHandler } from "./platform-admin";
import { lessons as samples } from "../src/data.js";
import { demo } from "../src/learning/demo.js";
const lessons = [demo, ...samples];
const stages = lessons.map((l) => l.title);
const mediaOrigins = (process.env.MEDIA_ASSET_ORIGINS || "")
  .split(",")
  .filter(Boolean)
  .map((value) => {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error(
        "MEDIA_ASSET_ORIGINS requires HTTPS origins without credentials",
      );
    return url.origin;
  });
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
              connectDomains: process.env.VITE_SUPABASE_URL
                ? [new URL(process.env.VITE_SUPABASE_URL).origin]
                : [],
              resourceDomains: [
                ...mediaOrigins,
                ...(process.env.VITE_SUPABASE_URL
                  ? [new URL(process.env.VITE_SUPABASE_URL).origin]
                  : []),
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
      title: "Open HanziOne",
      description:
        "Open the Vietnamese-language Chinese learning application. Account progress is private to the authenticated UI and not available to this public MCP server.",
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
          text: "HanziOne có bài nhập môn cho người mới và kho 10 bài mẫu riêng. UI hỗ trợ tài khoản Supabase khi được cấu hình; MCP server không đọc dữ liệu cá nhân hoặc tự đánh dấu hoàn thành.",
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
        "Preview lesson content in HanziOne. Does not grant progress or unlock lessons.",
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
const port = Number(process.env.PORT || process.env.MCP_PORT || 8787);
const curriculumAdmin = createCurriculumAdminHandler();
const platformAdmin = createPlatformAdminHandler();
const http = createServer(async (req, res) => {
  if (await platformAdmin(req, res)) return;
  if (await curriculumAdmin(req, res)) return;
  const pathname = new URL(req.url || "/", `http://localhost:${port}`).pathname;
  if (req.method === "GET" && pathname === "/health") {
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ status: "ok", application: "hanzi-quest" }));
    return;
  }
  if (req.method === "GET" && (pathname === "/" || /^\/learn\/[a-z][a-z0-9-]{1,99}\/?$/.test(pathname))) {
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
http.listen(
  port,
  process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1"),
  () =>
    console.log(
      `HanziOne: http://127.0.0.1:${port} · MCP: http://127.0.0.1:${port}/mcp`,
    ),
);
