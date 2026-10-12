import { test } from "node:test";
import assert from "node:assert/strict";
import { SyncManager, type Transport } from "../src/cloud/sync";
import { initial, type Progress } from "../src/progress";
import { operation, patchOperations } from "../src/cloud/operations";
import { newGame } from "../src/game-state";
import { lessons } from "../src/data";
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) || null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}
function server() {
  let progress = structuredClone(initial);
  const seen = new Set<string>();
  let fail = false;
  let applyCount = 0;
  const transport: Transport = {
    async snapshot() {
      return {
        progress: structuredClone(progress),
        stages: [],
        legacyPending: false,
      };
    },
    async apply(op) {
      if (fail) throw Error("Network");
      if (seen.has(op.id)) return;
      seen.add(op.id);
      applyCount++;
      if (op.kind === "note") {
        const p = op.payload as any;
        if (progress.notes !== p.base) throw Error("CONFLICT_NOTE");
        progress.notes = p.value;
      }
      if (op.kind === "profile")
        progress = { ...progress, ...(op.payload as object) };
    },
  };
  return {
    transport,
    get progress() {
      return progress;
    },
    set progress(p: Progress) {
      progress = p;
    },
    set fail(v: boolean) {
      fail = v;
    },
    get count() {
      return applyCount;
    },
  };
}
test("offline queue persists across reload, is account-scoped and flushes once", async () => {
  const store = storage(),
    s = server();
  let online = false;
  const a = new SyncManager(
    "A",
    s.transport,
    store,
    () => {},
    () => online,
  );
  a.enqueue([operation("note", { base: "", value: "Offline note" })]);
  a.setLocal({ ...a.progress, notes: "Offline note" });
  await a.flush();
  assert.equal(a.status, "offline");
  a.stop();
  const b = new SyncManager("B", s.transport, store, () => {});
  assert.equal(b.queue.length, 0);
  assert.equal(b.progress.notes, "");
  b.stop();
  const reload = new SyncManager(
    "A",
    s.transport,
    store,
    () => {},
    () => online,
  );
  assert.equal(reload.queue.length, 1);
  assert.equal(reload.progress.notes, "Offline note");
  online = true;
  await reload.flush();
  await reload.flush();
  assert.equal(s.count, 1);
  assert.equal(reload.status, "saved");
  assert.equal(reload.queue.length, 0);
  reload.stop();
});
test("network failure retains pending operation; duplicate delivery uses same ID", async () => {
  const s = server(),
    m = new SyncManager("A", s.transport, storage(), () => {});
  s.fail = true;
  const op = operation("profile", { name: "Linh" });
  m.enqueue([op]);
  await m.flush();
  assert.equal(m.status, "error");
  assert.equal(m.queue[0].id, op.id);
  s.fail = false;
  await m.flush();
  assert.equal(m.progress.name, "Linh");
  assert.equal(m.queue.length, 0);
  m.stop();
});
test("note edits coalesce preserving base and require explicit conflict choice", async () => {
  const s = server(),
    m = new SyncManager("A", s.transport, storage(), () => {});
  m.enqueue([operation("note", { base: "", value: "a" })]);
  m.enqueue([operation("note", { base: "a", value: "ab" })]);
  assert.equal(m.queue.length, 1);
  assert.equal((m.queue[0].payload as any).base, "");
  s.progress = { ...s.progress, notes: "Remote newer" };
  await m.flush();
  assert.equal(m.status, "conflict");
  assert.equal(m.queue.length, 1);
  await m.resolveNote(false);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(m.progress.notes, "Remote newer");
  assert.equal(m.queue.length, 0);
  m.stop();
});
test("game checkpoint survives reload with shuffled questions and checked response", () => {
  const store = storage(),
    s = server(),
    m = new SyncManager(
      "A",
      s.transport,
      store,
      () => {},
      () => false,
    );
  const state = newGame(lessons[0], false, lessons[0].questions);
  state.step = 0;
  state.feedback = true;
  state.responses = [{ selection: "你好", assisted: false }];
  state.score = 1;
  m.enqueue([operation("stage", state)]);
  m.setLocal(m.progress, [state]);
  m.stop();
  const reload = new SyncManager("A", s.transport, store, () => {});
  assert.deepEqual(reload.stages[0], state);
  reload.stop();
});
test("generic progress patches cannot enqueue XP or unlock operations", () => {
  const ops = patchOperations(structuredClone(initial), {
    xp: 999999,
    completed: ["boss"],
    history: [],
    name: "Linh",
  });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].kind, "profile");
  assert.deepEqual(ops[0].payload, { name: "Linh" });
});
test("storage denial is reported instead of claiming durable save", () => {
  const m = new SyncManager(
    "A",
    server().transport,
    {
      getItem: () => null,
      setItem: () => {
        throw Error("Quota");
      },
    },
    () => {},
  );
  assert.throws(
    () => m.enqueue([operation("note", { base: "", value: "x" })]),
    /Bộ nhớ/,
  );
  assert.equal(m.status, "error");
  assert.equal(m.queue.length, 0);
  m.stop();
});
