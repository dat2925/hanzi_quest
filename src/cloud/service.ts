import { createClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { Database, Json, Snapshot } from "./database.types";
import type { Transport } from "./sync";
export function accountTransport(userId: string): Transport {
  const client = createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      accessToken: async () => {
        const { data } = await supabase!.auth.getSession();
        if (data.session?.user.id !== userId)
          throw new Error(
            "Phiên đăng nhập đã thay đổi. Đăng nhập lại để đồng bộ.",
          );
        return data.session.access_token;
      },
    },
  );
  return {
    async snapshot() {
      const { data, error } = await client.rpc("learning_snapshot", {});
      if (error) throw new Error(error.message);
      return data as unknown as Snapshot;
    },
    async apply(op) {
      const { error } = await client.rpc("apply_learning_operation", {
        p_operation: op as unknown as Json,
      });
      if (error) throw new Error(error.message);
    },
  };
}
