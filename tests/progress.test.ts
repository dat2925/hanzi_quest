import test from "node:test";
import assert from "node:assert/strict";
import {
  initial,
  schedule,
  complete,
  available,
  dateKey,
  streak,
  progressSchema,
} from "../src/progress.ts";
test("review intervals grow, cap at 30 days, and reset on mistakes", () => {
  const a = schedule(undefined, true, 0);
  assert.equal(a.due, 86400000);
  const b = schedule(a, true, 0);
  assert.equal(b.interval, 2);
  assert.equal(schedule({ ...b, interval: 20 }, true, 0).interval, 30);
  assert.equal(schedule(b, false, 0).due, 600000);
  assert.equal(schedule(b, false, 0).interval, 0);
});
test("completion persists real history and never duplicates unlocked lessons", () => {
  const a = complete(
    initial,
    "hello",
    1,
    120,
    [{ hanzi: "你好", correct: true }],
    0,
  );
  assert.equal(a.xp, 40);
  assert.deepEqual(a.completed, ["hello"]);
  assert.equal(a.history[0].minutes, 2);
  const b = complete(a, "hello", 1, 70, [], 1);
  assert.equal(b.completed.length, 1);
  assert.equal(b.xp, 50);
  assert.ok(progressSchema.safeParse(b).success);
});
test("sequential unlocking and local Vietnam calendar streak", () => {
  assert.equal(available(initial, 1, ["hello", "pinyin"]), false);
  assert.equal(
    available({ ...initial, completed: ["hello"] }, 1, ["hello", "pinyin"]),
    true,
  );
  assert.equal(dateKey(new Date("2026-10-12T18:00:00Z")), "2026-10-13");
  const p = {
    ...initial,
    history: [
      { date: "2026-10-12", minutes: 3, xp: 20, lesson: "hello", accuracy: 1 },
      { date: "2026-10-11", minutes: 3, xp: 20, lesson: "hello", accuracy: 1 },
    ],
  };
  assert.equal(streak(p, new Date("2026-10-12T12:00:00Z")), 2);
  assert.equal(streak(p, new Date("2026-10-14T12:00:00Z")), 0);
});
test("failed lessons and free practice cannot unlock curriculum; a mixed recall schedules one early review", () => {
  assert.deepEqual(complete(initial, "hello", 0.5, 60, []).completed, []);
  assert.deepEqual(complete(initial, "practice", 1, 60, []).completed, []);
  const p = complete(
    initial,
    "hello",
    1,
    60,
    [
      { hanzi: "你好", correct: false },
      { hanzi: "你好", correct: true },
    ],
    0,
  );
  assert.equal(p.reviews["你好"].due, 600000);
  assert.equal(p.reviews["你好"].attempts, 1);
  assert.deepEqual(p.difficult, ["你好"]);
});
