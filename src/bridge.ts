import { App as McpApp } from "@modelcontextprotocol/ext-apps";
export async function openStandalone(url: string) {
  if (window.parent === window) {
    window.location.assign(url);
    return;
  }
  const app = new McpApp({ name: "Hanzi Quest Auth", version: "1.0.0" }, {});
  try {
    await app.connect();
    await app.openLink({ url });
  } finally {
    await app.close();
  }
}
export async function connectHost(
  onLesson: (id: string) => void,
  onTheme: (dark: boolean) => void,
) {
  if (window.parent === window) return null;
  const app = new McpApp(
    { name: "Hanzi Quest", version: "1.0.0" },
    {},
    { autoResize: true },
  );
  app.ontoolresult = (result) => {
    const data = result.structuredContent as { lessonId?: string } | undefined;
    if (data?.lessonId) onLesson(data.lessonId);
  };
  app.onhostcontextchanged = (context) => {
    if (context.theme) onTheme(context.theme === "dark");
  };
  try {
    await app.connect();
    const context = app.getHostContext();
    if (context?.theme) onTheme(context.theme === "dark");
    return app;
  } catch (error) {
    console.warn("MCP host unavailable; using standalone mode.", error);
    return null;
  }
}
