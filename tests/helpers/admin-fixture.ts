import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createCurriculumAdminHandler } from "../../server/admin";
import { createPlatformAdminHandler } from "../../server/platform-admin";
import { book1c } from "../../src/learning/book1c";
import type { Bundle } from "../../src/learning/schema";
export const adminIds = Array.from(
  { length: 5 },
  (_, i) => `70000000-0000-4000-8000-00000000000${i + 1}`,
);
const tokenExpiry = Math.floor(Date.now() / 1000) + 3600;
export function tokenFor(id: string) {
  return (
    Buffer.from('{"alg":"HS256"}').toString("base64url") +
    "." +
    Buffer.from(JSON.stringify({ sub: id, exp: tokenExpiry })).toString(
      "base64url",
    ) +
    ".qa-signature"
  );
}
export function qaBatch(n = 5): Bundle {
  const b = structuredClone(book1c);
  b.references = [];
  b.lessons = Array.from({ length: n }, (_, i) => ({
    ...structuredClone(book1c.lessons[0]),
    id: `qa-book1-next-${i + 1}`,
    title: `[QA ONLY] Lô Quyển 1 · ${i + 1}`,
    prerequisites: [i ? `qa-book1-next-${i}` : "hanzione-b1-l01c"],
  }));
  // Deliberately reverse the input to test prerequisite sorting. These are NOT authored lessons.
  b.lessons.reverse();
  return b;
}
async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
const close = (server: Server) =>
  new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((e) => (e ? reject(e) : resolve()));
  });
export async function adminFixture({
  publish1c = true,
  platform = false,
} = {}) {
  const db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;",
  );
  for (const id of adminIds)
    await db.query("insert into auth.users(id) values($1)", [id]);
  for (const name of [
    "202610120001_schema.sql",
    "202610120002_sample_content.sql",
    "202610120003_legacy_approval.sql",
    "202610120004_learning_structure.sql",
    "202610130001_book1_lesson1a_draft.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await db.exec(
    readFileSync(
      "supabase/manual/book1_lesson1a_publish_after_review.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610130002_book1_lesson1b_draft.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/manual/book1_lesson1b_publish_after_review.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610130003_book1_lesson1c_draft.sql",
      "utf8",
    ),
  );
  // Isolated test fixture only: production status of 1C is NOT inferred from this.
  if (publish1c)
    await db.exec(
      readFileSync(
        "supabase/manual/book1_lesson1c_publish_after_review.sql",
        "utf8",
      ),
    );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610130004_curriculum_admin.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202610130005_curriculum_practice_key_compatibility.sql",
      "utf8",
    ),
  );
  // Match Supabase's service role for the server-only vocabulary lookup.
  // This applies only to the isolated test database, never browser roles.
  await db.exec(
    "alter role service_role bypassrls; grant select on public.vocabulary to service_role;",
  );
  await db.query("insert into public.curriculum_admins(user_id) values($1)", [
    adminIds[0],
  ]);
  if (platform) {
    await db.exec(
      "alter table auth.users add column email text; alter table auth.users add column created_at timestamptz not null default now(); alter table auth.users add column last_sign_in_at timestamptz;",
    );
    for (const [i, id] of adminIds.entries())
      await db.query("update auth.users set email=$2 where id=$1", [
        id,
        `user${i + 1}@example.test`,
      ]);
    await db.exec(
      readFileSync(
        "supabase/migrations/202610130006_platform_admin.sql",
        "utf8",
      ),
    );
    await db.query("insert into public.platform_admins(user_id) values($1)", [
      adminIds[0],
    ]);
  }
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  };
  const as = async (id?: string, service = false) => {
    await db.exec(
      `reset role;set role ${service ? "service_role" : id ? "authenticated" : "anon"};`,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id || "",
    ]);
  };
  const user = (id: string) => ({
    id,
    aud: "authenticated",
    role: "authenticated",
    email: id === adminIds[0] ? "admin@example.test" : "student@example.test",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  });
  const supabaseMock = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://localhost");
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const id = adminIds.find((id) => token === tokenFor(id));
    const service = req.headers.apikey === "sb_secret_qa_server_only";
    const send = (status: number, value: unknown) =>
      res
        .writeHead(status, { "Content-Type": "application/json" })
        .end(JSON.stringify(value));
    if (url.pathname === "/auth/v1/user") {
      send(id ? 200 : 401, id ? user(id) : { message: "Invalid JWT" });
      return;
    }
    if (!id && !service) {
      send(401, { message: "Invalid JWT" });
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    try {
      const data = await serial(async () => {
        await as(id, service);
        if (url.pathname.startsWith("/rest/v1/rpc/")) {
          const name = url.pathname.split("/").at(-1)!;
          const args = raw ? JSON.parse(raw) : {};
          const signatures: Record<string, string[]> = {
            curriculum_admin_access: [],
            platform_admin_access: [],
            user_account_active: [],
            platform_admin_read: ["p_actor", "p_resource", "p_query"],
            platform_admin_apply: [
              "p_actor",
              "p_request",
              "p_action",
              "p_digest",
              "p_payload",
            ],
            learning_snapshot: [],
            apply_learning_operation: ["p_operation"],
            curriculum_admin_read: ["p_actor", "p_course"],
            curriculum_admin_replay: [
              "p_actor",
              "p_request",
              "p_action",
              "p_digest",
            ],
            curriculum_admin_apply: [
              "p_actor",
              "p_request",
              "p_action",
              "p_digest",
              "p_rows",
              "p_refs",
            ],
          };
          if (!(name in signatures)) throw new Error("UNKNOWN_RPC");
          const params = signatures[name].map((k) =>
            typeof args[k] === "object" && args[k] !== null
              ? JSON.stringify(args[k])
              : args[k],
          );
          const row = await db.query<{ value: unknown }>(
            `select public.${name}(${params.map((_, i) => `$${i + 1}`).join(",")}) as value`,
            params,
          );
          return row.rows[0].value;
        }
        if (url.pathname.endsWith("/vocabulary")) {
          // The API checks vocabulary as service_role, just like production.
          if (!service) throw new Error("SERVICE_REQUIRED");
          return (
            await db.query("select id,pinyin,meaning_vi from public.vocabulary")
          ).rows;
        }
        if (url.pathname.endsWith("/courses"))
          return (
            await db.query("select * from public.courses order by sort_order")
          ).rows;
        if (url.pathname.endsWith("/units"))
          return (
            await db.query(
              "select * from public.units where course_id=$1 order by sort_order",
              [url.searchParams.get("course_id")?.replace(/^eq\./, "")],
            )
          ).rows;
        if (url.pathname.endsWith("/lessons")) {
          return (
            await db.query(
              "select l.id,l.content_json,l.sort_order,jsonb_build_object('sort_order',u.sort_order,'courses',jsonb_build_object('sort_order',c.sort_order)) as units from public.lessons l join public.units u on u.id=l.unit_id join public.courses c on c.id=u.course_id where ($1::text is null or u.course_id=$1) and ($2::text is null or l.id=$2) and ($3::text is null or l.unit_id=$3) order by l.sort_order",
              [
                url.searchParams.get("units.course_id")?.replace(/^eq\./, "") ||
                  null,
                url.searchParams.get("id")?.replace(/^eq\./, "") || null,
                url.searchParams.get("unit_id")?.replace(/^eq\./, "") || null,
              ],
            )
          ).rows;
        }
        if (url.pathname.endsWith("/lesson_prerequisites"))
          return (
            await db.query(
              "select lesson_id,requires_lesson_id from public.lesson_prerequisites where ($1::text is null or lesson_id=$1) and ($2::text is null or requires_lesson_id=$2)",
              [
                url.searchParams.get("lesson_id")?.replace(/^eq\./, "") || null,
                url.searchParams
                  .get("requires_lesson_id")
                  ?.replace(/^eq\./, "") || null,
              ],
            )
          ).rows;
        if (url.pathname.endsWith("/study_sessions"))
          return (
            (
              await db.query(
                "select score,xp_earned from public.study_sessions where operation_id=$1 and user_id=$2",
                [
                  url.searchParams.get("operation_id")?.replace(/^eq\./, ""),
                  url.searchParams.get("user_id")?.replace(/^eq\./, ""),
                ],
              )
            ).rows[0] || null
          );
        throw new Error("UNKNOWN_REST_PATH");
      });
      send(200, data);
    } catch (e) {
      send(400, { message: e instanceof Error ? e.message : "QA_ERROR" });
    }
  });
  const sbUrl = await listen(supabaseMock);
  const env = {
    SUPABASE_URL: sbUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_qa_placeholder",
    SUPABASE_SECRET_KEY: "sb_secret_qa_server_only",
    VITE_APP_URL: "http://127.0.0.1:5174",
  };
  const handler = createCurriculumAdminHandler(env);
  const platformHandler = createPlatformAdminHandler(env);
  const apiServer = createServer(async (req, res) => {
    if (await platformHandler(req, res)) return;
    if (!(await handler(req, res))) res.writeHead(404).end();
  });
  const apiUrl = await listen(apiServer);
  const request = async (path = "", payload?: unknown, id = adminIds[0]) => {
    const response = await fetch(apiUrl + "/api/admin/curriculum" + path, {
      method: payload === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${tokenFor(id)}`,
        ...(payload === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const platformRequest = async (
    path: string,
    options: {
      method?: string;
      payload?: unknown;
      actor?: string | null;
      origin?: string;
    } = {},
  ) => {
    const actor = options.actor === undefined ? adminIds[0] : options.actor;
    const response = await fetch(apiUrl + "/api/admin" + path, {
      method:
        options.method || (options.payload === undefined ? "GET" : "POST"),
      headers: {
        ...(actor ? { Authorization: `Bearer ${tokenFor(actor)}` } : {}),
        ...(options.payload === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...(options.origin ? { Origin: options.origin } : {}),
      },
      ...(options.payload === undefined
        ? {}
        : { body: JSON.stringify(options.payload) }),
    });
    return { status: response.status, body: await response.json() };
  };
  return {
    db,
    serial,
    as,
    user,
    sbUrl,
    apiUrl,
    env,
    request,
    platformRequest,
    close: async () => {
      await close(apiServer);
      await close(supabaseMock);
      await db.close();
    },
  };
}
