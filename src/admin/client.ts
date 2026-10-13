import { supabase } from "../cloud/client";
export async function adminRequest(path = "", payload?: unknown) {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Hãy đăng nhập tài khoản quản trị.");
  const response = await fetch(`/api/admin/curriculum${path}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
    },
    credentials: "omit",
    cache: "no-store",
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
