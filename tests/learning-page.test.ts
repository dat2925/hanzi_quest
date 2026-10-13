import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newGame,
  newestCheckpoint,
  gameSnapshotSchema,
} from "../src/game-state";
import { lesson1a } from "../src/learning/book1";
import { readLearningRoute } from "../src/learning/navigation";

test("resume chooses the newest compatible checkpoint, retaining legacy snapshots and ignoring invalid/newer foreign content", () => {
  const base = newGame(lesson1a, false, lesson1a.questions);
  const remote = { ...base, screenIndex: 0, checkpointAt: 100 };
  const local = { ...base, screenIndex: 1, checkpointAt: 200 };
  assert.equal(newestCheckpoint(lesson1a, [remote, local])?.screenIndex, 1);
  assert.equal(
    newestCheckpoint(lesson1a, [
      local,
      {
        ...local,
        checkpointAt: 300,
        lesson: { ...lesson1a, id: "foreign-id" },
      },
    ])?.screenIndex,
    1,
  );
  assert.equal(
    newestCheckpoint(lesson1a, [
      { ...local, lesson: { ...lesson1a, questions: [] } },
      remote,
    ])?.screenIndex,
    0,
  );
  assert.ok(gameSnapshotSchema.safeParse(base).success);
  assert.equal(newestCheckpoint(lesson1a, [null, {}]), undefined);
});

test("learning route parses only learning paths and never returns an external return URL", () => {
  const original = globalThis.window;
  try {
    (globalThis as any).window = {
      location: { pathname: "/learn/hanzione-b1-l01a" },
      history: {
        state: {
          hanziLearning: { returnUrl: "//evil.example/", returnPage: "path" },
        },
      },
    };
    assert.equal(readLearningRoute()?.mode, "study");
    assert.equal(readLearningRoute()?.returnUrl, "/?page=path");
    (globalThis as any).window.location.pathname = "/learn/preview";
    assert.equal(readLearningRoute()?.mode, "preview");
    (globalThis as any).window.location.pathname = "/api/learn/hello";
    assert.equal(readLearningRoute(), null);
  } finally {
    (globalThis as any).window = original;
  }
});
