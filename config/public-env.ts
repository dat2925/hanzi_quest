export function validatePublicEnv(env: Record<string, string | undefined>) {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url && !key) return;
  if (!url || !key)
    throw new Error("Cần cấu hình cả Project URL và publishable key.");
  if (!key.startsWith("sb_publishable_"))
    throw new Error(
      "Không build secret/service_role key vào frontend; chỉ dùng sb_publishable_.",
    );
  const parsed = new URL(url);
  if (
    parsed.username ||
    parsed.password ||
    (parsed.protocol !== "https:" &&
      !(
        parsed.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(parsed.hostname)
      ))
  )
    throw new Error(
      "Supabase URL phải là HTTPS hoặc local loopback, không chứa credential.",
    );
}
