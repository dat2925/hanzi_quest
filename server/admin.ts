import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { prepareBatch, selectedBatch } from "../src/admin/batch";
import type { AdminCatalog } from "../src/admin/types";

const command = z.object({
  requestId: z.uuid(),
  bundle: z.unknown().optional(),
  courseId: z.string().optional(),
  ids: z.array(z.string()).min(1).max(20).optional(),
  expected: z.record(z.string(), z.number().int().nonnegative()).default({}),
  sourceChecked: z.boolean().optional(),
  previewsChecked: z.boolean().optional(),
});
const canonical = (v: any): any =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const digest = (v: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(v)))
    .digest("hex");
async function body(req: IncomingMessage) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new Error("JSON_REQUIRED");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4000000) throw new Error("BATCH_TOO_LARGE");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function createCurriculumAdminHandler(env = process.env) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (!url.pathname.startsWith("/api/admin/curriculum")) return false;
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
      const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!sbUrl || !publicKey) {
        send(503, { error: "ADMIN_SERVER_NOT_CONFIGURED" });
        return true;
      }
      const userClient = createClient(sbUrl, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: user, error: authError } =
        await userClient.auth.getUser(token);
      if (authError || !user.user) {
        send(401, { error: "AUTH_REQUIRED" });
        return true;
      }
      const access = await userClient.rpc("curriculum_admin_access");
      if (access.error) {
        send(503, { error: "ADMIN_MIGRATION_REQUIRED" });
        return true;
      }
      if (access.data !== true) {
        send(403, { error: "CURRICULUM_ADMIN_REQUIRED" });
        return true;
      }
      if (req.method === "GET" && url.pathname.endsWith("/access")) {
        send(200, { admin: true });
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
      const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
      if (!secret) {
        send(503, { error: "ADMIN_SERVER_SECRET_REQUIRED" });
        return true;
      }
      // This module is server-only. Never import it into src/ or expose this key in VITE_*.
      const db = createClient(sbUrl, secret, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const rpc = async (name: string, args: Record<string, unknown>) => {
        const { data, error } = await db.rpc(name, {
          p_actor: user.user!.id,
          ...args,
        });
        if (error) throw new Error(error.message);
        return data;
      };
      const read = (course: string | null) =>
        rpc("curriculum_admin_read", {
          p_course: course,
        }) as Promise<AdminCatalog>;
      if (req.method === "GET" && url.pathname === "/api/admin/curriculum") {
        send(200, await read(url.searchParams.get("course")));
        return true;
      }
      const action = url.pathname.split("/").at(-1)!;
      if (
        req.method !== "POST" ||
        !["validate", "save", "review", "publish"].includes(action)
      ) {
        send(405, { error: "METHOD_NOT_ALLOWED" });
        return true;
      }
      const raw = command.parse(await body(req));
      const hash = digest(raw);
      if (action !== "validate") {
        const old = await rpc("curriculum_admin_replay", {
          p_request: raw.requestId,
          p_action: action,
          p_digest: hash,
        });
        if (old) {
          send(200, old);
          return true;
        }
      }
      const courseId =
        action === "save" || action === "validate"
          ? (raw.bundle as any)?.courseId
          : raw.courseId;
      if (typeof courseId !== "string") throw new Error("COURSE_REQUIRED");
      const catalog = await read(courseId);
      if ((action === "review" || action === "publish") && !raw.ids)
        throw new Error("SELECT_LESSONS");
      if (action === "review" && (!raw.sourceChecked || !raw.previewsChecked))
        throw new Error("SOURCE_AND_PREVIEW_REVIEW_REQUIRED");
      const input =
        action === "save" || action === "validate"
          ? raw.bundle
          : selectedBatch(catalog, courseId, raw.ids!);
      const batch = prepareBatch(
        input,
        catalog,
        action === "publish"
          ? "publish"
          : action === "review"
            ? "review"
            : "save",
        raw.expected,
      );
      if (action === "review" || action === "publish") {
        // Keep existing SRS readings for whitespace-only Pinyin variants.
        // Normalize compiled words/practice only; authored learning remains unchanged.
        const ids = [
          ...new Set(
            batch.rows.flatMap((r) => r.content.words.map((w) => w.hanzi)),
          ),
        ];
        const known = new Map<
          string,
          { pinyin: string; meaning: string; source: string }
        >();
        for (let from = 0; from < ids.length; from += 50) {
          const { data, error } = await db
            .from("vocabulary")
            .select("id,pinyin,meaning_vi")
            .in("id", ids.slice(from, from + 50));
          if (error)
            throw new Error(
              "Không đọc được kho từ vựng để kiểm tra xuất bản. Hãy thử lại.",
            );
          for (const w of data || [])
            known.set(w.id, {
              pinyin: w.pinyin,
              meaning: w.meaning_vi,
              source: "Kho từ vựng hiện tại",
            });
        }
        const conflicts: string[] = [];
        for (const r of batch.rows)
          for (const [index, w] of r.content.words.entries()) {
            const old = known.get(w.hanzi);
            const sameReading =
              old &&
              old.pinyin.normalize("NFC").replace(/\s/g, "") ===
                w.pinyin.normalize("NFC").replace(/\s/g, "");
            if (old && sameReading && old.meaning === w.meaning) {
              r.content.words[index] = { ...w, pinyin: old.pinyin };
              for (const { question } of r.bank)
                if (
                  !question.contentId &&
                  question.audio === w.hanzi &&
                  question.type === "quiz" &&
                  question.prompt === `Pinyin của ${w.hanzi} là gì?`
                )
                  question.answer = old.pinyin;
            } else if (old) {
              conflicts.push(
                `${r.learning.title} (${r.id}) · ${w.hanzi}\n${old.source}: ${JSON.stringify(old.pinyin)} — ${JSON.stringify(old.meaning)}\nBài mới: ${JSON.stringify(w.pinyin)} — ${JSON.stringify(w.meaning)}`,
              );
            } else if (!old) {
              known.set(w.hanzi, {
                pinyin: w.pinyin,
                meaning: w.meaning,
                source: `Bài ${r.id} trong cùng lô`,
              });
            }
          }
        if (conflicts.length)
          throw new Error(
            "VOCABULARY_CONFLICT_REVIEW_READING_AND_MEANING\n" +
              "Chưa duyệt/xuất bản lô bài. Hãy đối chiếu nguồn, sửa Pinyin/nghĩa trong bản nháp rồi lưu và duyệt lại.\n" +
              conflicts.join("\n\n"),
          );
      }
      if (action === "validate")
        send(200, { bundle: batch.bundle, ids: batch.rows.map((r) => r.id) });
      else
        send(
          200,
          await rpc("curriculum_admin_apply", {
            p_request: raw.requestId,
            p_action: action,
            p_digest: hash,
            p_rows: batch.rows,
            p_refs: batch.refs,
          }),
        );
    } catch (error) {
      // Report validation paths/known DB guards, never SDK objects, headers, tokens or secrets.
      const message =
        error instanceof z.ZodError
          ? error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("\n")
          : error instanceof SyntaxError
            ? "INVALID_JSON"
            : error instanceof Error
              ? error.message
              : "ADMIN_REQUEST_FAILED";
      const safe = message
        .replace(/\b(?:sb_(?:secret|publishable)_|eyJ)[\w.-]+/g, "[REDACTED]")
        .slice(0, 6000);
      send(/CURRICULUM_ADMIN_REQUIRED/.test(safe) ? 403 : 400, { error: safe });
    }
    return true;
  };
}
