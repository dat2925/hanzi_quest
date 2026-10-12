import { defineConfig, loadEnv } from "vite";
import { validatePublicEnv } from "./config/public-env.ts";
import react from "@vitejs/plugin-react";
// A single self-contained resource can be served by any MCP Apps host.
export default defineConfig(({ mode }) => {
  validatePublicEnv(loadEnv(mode, process.cwd(), ""));
  return {
    plugins: [
      react(),
      {
        name: "inline-mcp-resource",
        enforce: "post",
        generateBundle(_, bundle) {
          const html = bundle["index.html"];
          if (!html || html.type !== "asset") return;
          let source = String(html.source);
          for (const [name, item] of Object.entries(bundle)) {
            if (item.type === "chunk") {
              source = source.replace(
                new RegExp(
                  `<script[^>]*src="/?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*></script>`,
                ),
                () =>
                  `<script type="module">${item.code.replace(/<\/script/gi, "<\\/script")}</script>`,
              );
              delete bundle[name];
            } else if (name.endsWith(".css")) {
              source = source.replace(
                new RegExp(
                  `<link[^>]*href="/?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`,
                ),
                () =>
                  `<style>${String(item.source).replace(/<\/style/gi, "<\\/style")}</style>`,
              );
              delete bundle[name];
            }
          }
          html.source = source;
        },
      },
    ],
    server: { port: 5173, strictPort: true },
    build: {
      target: "es2022",
      rollupOptions: { output: { codeSplitting: false } },
    },
  };
});
