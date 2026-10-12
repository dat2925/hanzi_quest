import { z } from "zod";
import {
  initial,
  progressSchema,
  schedule,
  complete,
  type Progress,
} from "../progress";
import { gameSnapshotSchema, type GameSnapshot } from "../game-state";
import { optimistic } from "./operations";
import type { Operation, Snapshot } from "./database.types";
export type SyncStatus =
  "loading" | "saving" | "saved" | "offline" | "error" | "conflict";
export interface Transport {
  snapshot(): Promise<Snapshot>;
  apply(op: Operation): Promise<void>;
}
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const opSchema = z.object({
  id: z.uuid(),
  kind: z.enum([
    "profile",
    "note",
    "review",
    "difficult",
    "task",
    "stage",
    "finish",
    "legacy",
  ]),
  payload: z.json(),
});
const cacheSchema = z.object({
  progress: progressSchema,
  stages: z.array(gameSnapshotSchema),
  queue: z.array(opSchema),
  legacyPending: z.boolean().default(false),
  legacyStatus: z
    .enum(["pending", "approved", "rejected"])
    .nullable()
    .default(null),
});
export class SyncManager {
  readonly key: string;
  progress: Progress = structuredClone(initial);
  stages: GameSnapshot[] = [];
  queue: Operation[] = [];
  legacyPending = false;
  legacyStatus: "pending" | "approved" | "rejected" | null = null;
  hasLoaded = false;
  status: SyncStatus = "loading";
  error = "";
  private active = true;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  constructor(
    readonly userId: string,
    private transport: Transport,
    private storage: StorageLike,
    private changed: () => void,
    private online = () => true,
  ) {
    this.key = `hanzi-account-v1:${userId}`;
    try {
      const c = cacheSchema.parse(
        JSON.parse(storage.getItem(this.key) || "null"),
      );
      this.progress = c.progress;
      this.stages = c.stages;
      this.queue = c.queue as Operation[];
      this.legacyPending = c.legacyPending;
      this.legacyStatus = c.legacyStatus;
      this.hasLoaded = true;
    } catch {
      /* Old local progress is never automatically assigned to an account. */
    }
  }
  private persist() {
    this.storage.setItem(
      this.key,
      JSON.stringify({
        progress: this.progress,
        stages: this.stages,
        queue: this.queue,
        legacyPending: this.legacyPending,
        legacyStatus: this.legacyStatus,
      }),
    );
  }
  private notify() {
    if (this.active) this.changed();
  }
  enqueue(ops: Operation[]) {
    // Persist before showing success. Storage denial must not silently discard work.
    const previous = [...this.queue];
    for (let op of ops) {
      const tail = this.queue.at(-1);
      if (
        tail &&
        !this.running &&
        tail.kind === op.kind &&
        ["note", "stage"].includes(op.kind)
      ) {
        if (op.kind === "note")
          op = {
            ...op,
            payload: {
              ...(op.payload as object),
              base: (tail.payload as any).base,
            },
          };
        this.queue[this.queue.length - 1] = op;
      } else this.queue.push(op);
    }
    try {
      this.persist();
    } catch {
      this.queue = previous;
      this.status = "error";
      this.error =
        "Bộ nhớ trình duyệt bị chặn. Xuất bản sao trước khi đóng trang.";
      this.notify();
      throw new Error(this.error);
    }
    this.status = this.online() ? "saving" : "offline";
    this.notify();
    this.schedule(800);
  }
  setLocal(progress: Progress, stages = this.stages) {
    this.progress = progress;
    this.stages = stages;
    try {
      this.persist();
    } catch {
      this.status = "error";
      this.error = "Không ghi được bộ nhớ đệm.";
    }
    this.notify();
  }
  private schedule(ms: number) {
    clearTimeout(this.timer);
    if (this.active) this.timer = setTimeout(() => void this.flush(), ms);
  }
  async flush() {
    if (!this.active || this.running) return;
    if (!this.online()) {
      this.status = "offline";
      this.notify();
      return;
    }
    this.running = true;
    this.status = "saving";
    this.notify();
    try {
      while (this.active && this.queue.length) {
        const op = this.queue[0];
        await this.transport.apply(op);
        if (!this.active) return;
        this.queue.shift();
        this.persist();
      }
      if (!this.active) return;
      const snapshot = await this.transport.snapshot();
      if (!this.active) return;
      this.progress = progressSchema.parse(snapshot.progress);
      this.hasLoaded = true;
      this.stages = snapshot.stages.map((s) => gameSnapshotSchema.parse(s));
      this.legacyPending = snapshot.legacyPending;
      this.legacyStatus = snapshot.legacyStatus || null;
      // Edits can arrive while the snapshot request is in flight; replay only pending operations.
      for (const op of this.queue) this.replay(op);
      this.persist();
      this.failures = 0;
      this.error = "";
      this.status = this.queue.length ? "saving" : "saved";
      if (this.queue.length) this.schedule(800);
    } catch (error) {
      if (!this.active) return;
      this.error =
        error instanceof Error ? error.message : "Không đồng bộ được.";
      this.status = this.error.includes("CONFLICT_NOTE")
        ? "conflict"
        : this.online()
          ? "error"
          : "offline";
      if (this.status !== "conflict")
        this.schedule(Math.min(60000, 2000 * 2 ** this.failures++));
    } finally {
      this.running = false;
      this.notify();
    }
  }
  private replay(op: Operation) {
    this.progress = optimistic(this.progress, op);
    const p = op.payload as any;
    if (op.kind === "review")
      this.progress = {
        ...this.progress,
        reviews: {
          ...this.progress.reviews,
          [p.hanzi]: schedule(this.progress.reviews[p.hanzi], p.correct),
        },
      };
    if (op.kind === "stage")
      this.stages = [
        p,
        ...this.stages.filter((s) => s.lesson.id !== p.lesson.id),
      ];
    // Offline achievements are provisional until RPC confirms the actual score/reward.
    if (op.kind === "finish")
      this.stages = this.stages.filter((s) => s.sessionId !== op.id);
  }
  async resolveNote(useLocal: boolean) {
    const snapshot = await this.transport.snapshot();
    if (!this.active) return;
    const head = this.queue[0];
    if (head?.kind !== "note") return;
    if (useLocal)
      head.payload = {
        ...(head.payload as object),
        base: snapshot.progress.notes,
      };
    else {
      this.queue.shift();
      this.progress = { ...this.progress, notes: snapshot.progress.notes };
    }
    this.persist();
    this.status = "saving";
    this.notify();
    void this.flush();
  }
  stop() {
    this.active = false;
    clearTimeout(this.timer);
  }
  start() {
    this.active = true;
    void this.flush();
  }
  export() {
    return JSON.stringify(
      {
        userId: this.userId,
        progress: this.progress,
        stages: this.stages,
        pending: this.queue,
      },
      null,
      2,
    );
  }
}
