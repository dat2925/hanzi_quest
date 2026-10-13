import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9-]{1,99}$/);
const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
};
const search = z.string().trim().max(100).default("");
const revision = z.number().int().nonnegative();
const common = { requestId: z.uuid(), expectedRevision: revision };
const title = z.string().trim().min(1).max(200);
const description = z.string().max(5000).default("");
const role = z.enum(["learner", "editor", "admin"]);
const commands = {
  "user.update": z
    .object({
      ...common,
      id: z.uuid(),
      displayName: z.string().trim().min(1).max(100),
      targetHsk: z.string().trim().min(1).max(100),
      dailyGoalMinutes: z.number().int().min(1).max(180),
      profileUpdatedAt: z.iso.datetime({ offset: true }).nullable(),
    })
    .strict(),
  "user.access": z
    .object({
      ...common,
      id: z.uuid(),
      suspended: z.boolean(),
      reason: z.string().trim().max(500).default(""),
    })
    .strict()
    .refine(
      (v) => !v.suspended || v.reason.length > 0,
      "Cần lý do khóa tài khoản",
    ),
  "user.role": z.object({ ...common, id: z.uuid(), role }).strict(),
  "course.save": z
    .object({
      ...common,
      id,
      title,
      description,
      sortOrder: z.number().int().min(0).max(1000000),
      family: z.enum(["foundation", "HSK"]).optional(),
      syllabusVersion: z.string().trim().min(1).max(100).optional(),
      hskLevel: z.number().int().min(1).max(9).nullable().optional(),
    })
    .strict(),
  "chapter.save": z
    .object({
      ...common,
      id,
      courseId: id,
      title,
      description,
      sortOrder: z.number().int().min(0).max(1000000),
    })
    .strict(),
  "lesson.visibility": z
    .object({ ...common, id, published: z.boolean() })
    .strict(),
  "draft.delete": z.object({ ...common, id }).strict(),
};

async function readJson(req: IncomingMessage) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new Error("JSON_REQUIRED");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20000) throw new Error("COMMAND_TOO_LARGE");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, v]) => [key, canonical(v)]),
        )
      : value;

export function createPlatformAdminHandler(env = process.env) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> => {
    const url = new URL(req.url || "/", "http://localhost");
    const base = "/api/admin";
    if (url.pathname !== base && !url.pathname.startsWith(base + "/"))
      return false;
    // The existing editorial handler owns this exact namespace.
    if (
      url.pathname === base + "/curriculum" ||
      url.pathname.startsWith(base + "/curriculum/")
    )
      return false;
    const send = (status: number, value: unknown) =>
      res
        .writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        })
        .end(JSON.stringify(value));
    try {
      const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
      if (!token) {
        send(401, { error: "AUTH_REQUIRED" });
        return true;
      }
      const sbUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
      const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
      if (!sbUrl || !key || !secret) {
        send(503, { error: "ADMIN_SERVER_NOT_CONFIGURED" });
        return true;
      }
      const options = {
        auth: { persistSession: false, autoRefreshToken: false },
      };
      const userClient = createClient(sbUrl, key, {
        ...options,
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: auth, error: authError } =
        await userClient.auth.getUser(token);
      if (authError || !auth.user) {
        send(401, { error: "AUTH_REQUIRED" });
        return true;
      }
      const access = await userClient.rpc("platform_admin_access");
      if (access.error) {
        send(503, { error: "ADMIN_MIGRATION_REQUIRED" });
        return true;
      }
      if (access.data !== true) {
        send(403, { error: "PLATFORM_ADMIN_REQUIRED" });
        return true;
      }
      if (
        req.headers.origin &&
        env.VITE_APP_URL &&
        new URL(req.headers.origin).origin !== new URL(env.VITE_APP_URL).origin
      ) {
        send(403, { error: "ORIGIN_NOT_ALLOWED" });
        return true;
      }
      const db = createClient(sbUrl, secret, options);
      const rpc = async (name: string, args: Record<string, unknown>) => {
        const { data, error } = await db.rpc(name, {
          p_actor: auth.user!.id,
          ...args,
        });
        if (error) throw new Error(error.message);
        return data;
      };
      const path = url.pathname.slice(base.length);
      const query = Object.fromEntries(url.searchParams);
      if (req.method === "GET") {
        let resource: string;
        let parsed: Record<string, unknown>;
        if (path === "/access") {
          send(200, {
            admin: true,
            userId: auth.user.id,
            role: "admin",
            capabilities: [
              "users.read",
              "users.update",
              "users.access",
              "users.roles",
              "courses.manage",
              "lessons.manage",
              "curriculum.publish",
              "audit.read",
            ],
          });
          return true;
        } else if (path === "/overview") {
          resource = "overview";
          parsed = z.object({}).strict().parse(query);
        } else if (path === "/users") {
          resource = "users";
          parsed = z
            .object({
              ...pagination,
              search,
              status: z.enum(["active", "suspended"]).optional(),
              role: role.optional(),
            })
            .strict()
            .parse(query);
        } else if (/^\/users\/[^/]+$/.test(path)) {
          resource = "user";
          parsed = {
            ...z.object(pagination).strict().parse(query),
            id: z.uuid().parse(path.split("/")[2]),
          };
        } else if (path === "/courses") {
          resource = "courses";
          parsed = z
            .object({ ...pagination, search })
            .strict()
            .parse(query);
        } else if (path === "/chapters") {
          resource = "chapters";
          parsed = z
            .object({ ...pagination, courseId: id })
            .strict()
            .parse(query);
        } else if (path === "/lessons") {
          resource = "lessons";
          parsed = z
            .object({
              ...pagination,
              search,
              courseId: id.optional(),
              chapterId: id.optional(),
              status: z
                .enum(["draft", "reviewed", "published", "hidden"])
                .optional(),
            })
            .strict()
            .parse(query);
        } else if (path === "/audit") {
          resource = "audit";
          parsed = z
            .object({ ...pagination, search })
            .strict()
            .parse(query);
        } else {
          send(404, { error: "ADMIN_ROUTE_NOT_FOUND" });
          return true;
        }
        send(
          200,
          await rpc("platform_admin_read", {
            p_resource: resource,
            p_query: parsed,
          }),
        );
      } else if (req.method === "POST") {
        const match = path.match(/^\/commands\/([^/]+)$/);
        const action = match?.[1] as keyof typeof commands;
        if (!action || !Object.hasOwn(commands, action)) {
          send(404, { error: "ADMIN_ROUTE_NOT_FOUND" });
          return true;
        }
        const payload = commands[action].parse(await readJson(req));
        const digest = createHash("sha256")
          .update(JSON.stringify(canonical({ action, payload })))
          .digest("hex");
        send(
          200,
          await rpc("platform_admin_apply", {
            p_request: payload.requestId,
            p_action: action,
            p_digest: digest,
            p_payload: payload,
          }),
        );
      } else {
        send(405, { error: "METHOD_NOT_ALLOWED" });
      }
    } catch (error) {
      const raw =
        error instanceof z.ZodError
          ? error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("\n")
          : error instanceof SyntaxError
            ? "INVALID_JSON"
            : error instanceof Error
              ? error.message
              : "ADMIN_REQUEST_FAILED";
      const message = raw
        .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
        .replace(/\b(?:sb_(?:secret|publishable)_|eyJ)[\w.-]+/g, "[REDACTED]")
        .slice(0, 6000);
      const status = /PLATFORM_ADMIN_REQUIRED|ACCOUNT_SUSPENDED/.test(message)
        ? 403
        : /NOT_FOUND/.test(message)
          ? 404
          : /REVISION_CONFLICT|PROFILE_CHANGED|REQUEST_ID_CONFLICT|DEPENDENTS_EXIST/.test(
                message,
              )
            ? 409
            : 400;
      send(status, { error: message });
    }
    return true;
  };
}
