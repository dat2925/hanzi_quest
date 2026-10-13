import { useEffect, useRef, useState } from "react";
import type { Lesson } from "../data";

export type LearningMode = "study" | "preview" | "practice";
export type LearningRoute = {
  id: string;
  key: string;
  mode: LearningMode;
  sessionId?: string;
  returnUrl: string;
  returnPage: string;
  index: number;
  returnIndex: number;
};
export function readLearningRoute(): LearningRoute | null {
  const match = window.location.pathname.match(
    /^\/learn\/([a-z][a-z0-9-]{1,99})\/?$/,
  );
  if (!match) return null;
  const saved = window.history.state?.hanziLearning;
  return {
    id: match[1],
    key: saved?.key || match[1],
    mode:
      match[1] === "preview"
        ? "preview"
        : match[1] === "practice"
          ? "practice"
          : "study",
    sessionId: saved?.sessionId,
    returnUrl:
      typeof saved?.returnUrl === "string" &&
      saved.returnUrl.startsWith("/") &&
      !saved.returnUrl.startsWith("//") &&
      !saved.returnUrl.startsWith("/learn/")
        ? saved.returnUrl
        : "/?page=path",
    returnPage: saved?.returnPage || "path",
    index: window.history.state?.hanziIndex ?? 1,
    returnIndex: saved?.returnIndex ?? 0,
  };
}
export function useLearningNavigation(onReturn: (page: string) => void) {
  const [route, setRoute] = useState(readLearningRoute);
  const routeRef = useRef(route);
  routeRef.current = route;
  const intents = useRef(new Map<string, Lesson>());
  const guard = useRef<() => boolean>(() => true);
  const allowPop = useRef(false),
    restoring = useRef(false);
  const returnRef = useRef(onReturn);
  returnRef.current = onReturn;
  useEffect(() => {
    const pop = () => {
      const current = routeRef.current;
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      if (current && !allowPop.current && !guard.current()) {
        restoring.current = true;
        window.history.go(
          current.index - (window.history.state?.hanziIndex ?? 0) || 1,
        );
        return;
      }
      allowPop.current = false;
      const next = readLearningRoute();
      setRoute(next);
      if (!next && current)
        returnRef.current(
          window.history.state?.hanziPage || current.returnPage,
        );
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const open = (lesson: Lesson, mode: LearningMode, returnPage: string) => {
    const current = routeRef.current;
    const index = window.history.state?.hanziIndex ?? 0;
    if (!current)
      window.history.replaceState(
        { ...window.history.state, hanziIndex: index, hanziPage: returnPage },
        "",
      );
    const key = crypto.randomUUID();
    intents.current.set(key, lesson);
    const saved = {
      key,
      mode,
      returnIndex: current?.returnIndex ?? index,
      returnPage: current?.returnPage || returnPage,
      returnUrl:
        current?.returnUrl ||
        window.location.pathname +
          window.location.search +
          window.location.hash,
    };
    const url = `/learn/${mode === "study" ? encodeURIComponent(lesson.id) : mode}`;
    window.history.pushState(
      { hanziIndex: index + 1, hanziLearning: saved },
      "",
      url,
    );
    setRoute(readLearningRoute());
    window.scrollTo(0, 0);
  };
  const close = (toJourney = false) => {
    const current = routeRef.current;
    if (!current || !guard.current()) return;
    if (toJourney || !window.history.state?.hanziLearning?.key) {
      window.history.replaceState(
        { hanziIndex: 0, hanziPage: "path" },
        "",
        "/?page=path",
      );
      setRoute(null);
      returnRef.current("path");
    } else {
      allowPop.current = true;
      window.history.go(-Math.max(1, current.index - current.returnIndex));
    }
  };
  return {
    route,
    intent: route ? intents.current.get(route.key) : undefined,
    open,
    close,
    invalidatePreviews: () => {
      intents.current.clear();
      if (routeRef.current?.mode !== "preview") return;
      window.history.replaceState(
        { hanziIndex: 0, hanziPage: "path" },
        "",
        "/?page=path",
      );
      setRoute(null);
      returnRef.current("path");
    },
    setGuard: (fn: () => boolean) => {
      guard.current = fn;
    },
    rememberSession: (sessionId: string) => {
      if (!routeRef.current || routeRef.current.sessionId === sessionId) return;
      const current = routeRef.current;
      const updated = { ...current, sessionId };
      window.history.replaceState(
        {
          ...window.history.state,
          hanziLearning: updated,
          hanziIndex: current.index,
        },
        "",
      );
      routeRef.current = updated; // No rerender/reset of the active lesson.
    },
  };
}
