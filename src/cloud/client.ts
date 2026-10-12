import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const cloudConfigured = Boolean(
  url && key && !url.includes("YOUR_PROJECT") && !key.includes("REPLACE_ME"),
);
// Reject server secrets instead of accidentally embedding privileged credentials.
if (key && !key.startsWith("sb_publishable_"))
  throw new Error(
    "Chỉ dùng Supabase publishable key (sb_publishable_), không dùng secret/service_role.",
  );
export const embedded =
  typeof window !== "undefined" && window.parent !== window;
export const appUrl = (
  (import.meta.env.VITE_APP_URL as string | undefined) || window.location.origin
).replace(/\/+$/, "");
export const supabase = cloudConfigured
  ? createClient<Database>(url!, key!, {
      auth: {
        persistSession: !embedded,
        autoRefreshToken: !embedded,
        detectSessionInUrl: !embedded,
        flowType: "pkce",
      },
    })
  : null;
