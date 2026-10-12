import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePublicEnv } from "../config/public-env";
test("build refuses privileged or incomplete public credentials", () => {
  assert.doesNotThrow(() => validatePublicEnv({}));
  assert.doesNotThrow(() =>
    validatePublicEnv({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_placeholder",
    }),
  );
  assert.throws(() =>
    validatePublicEnv({ VITE_SUPABASE_URL: "https://example.supabase.co" }),
  );
  assert.throws(
    () =>
      validatePublicEnv({
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "privileged-placeholder",
      }),
    /service_role/,
  );
  assert.throws(() =>
    validatePublicEnv({
      VITE_SUPABASE_URL: "http://untrusted.example",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_placeholder",
    }),
  );
});
