import { useEffect, useRef, useState } from "react";
import { ArrowRight, X, RefreshCw, CheckCircle2 } from "lucide-react";
import Game from "../Game";
import { lessons as catalog, type Lesson } from "../data";
import {
  gameSnapshotSchema,
  newestCheckpoint,
  type GameSnapshot,
} from "../game-state";
import {
  canStudy,
  complete,
  dateKey,
  schedule,
  load,
  STORAGE_KEY,
  type Progress,
} from "../progress";
import { useAccount } from "../cloud/Account";
import { supabase } from "../cloud/client";
import { operation, finishOperation } from "../cloud/operations";
import type { Operation } from "../cloud/database.types";
import { publishedLesson } from "./published";
import type { LearningRoute } from "./navigation";
import "./learning-page.css";

type Receipt = { score: number; xp_earned: number };
type FinishRecord = {
  state: GameSnapshot;
  seconds: number;
  answers: { hanzi: string; correct: boolean }[];
  ops: Operation[];
  localReceipt?: Receipt;
};
export function LearningWorkspace({
  route,
  intent,
  progress,
  allLessons,
  sound,
  onProgress,
  onClose,
  onNext,
  setGuard,
  rememberSession,
}: {
  route: LearningRoute;
  intent?: Lesson;
  progress: Progress;
  allLessons: Lesson[];
  sound: boolean;
  onProgress: (p: Progress) => void;
  onClose: (toJourney?: boolean) => void;
  onNext: (lesson: Lesson) => void;
  setGuard: (fn: () => boolean) => void;
  rememberSession: (id: string) => void;
}) {
  const { manager } = useAccount();
  const owner = manager?.userId || "guest";
  const preview = route.mode === "preview";
  const cpKey = `hanzi-learning-checkpoint:${owner}:${route.id}`;
  const finishKey = (id: string) => `hanzi-learning-finish:${owner}:${id}`;
  const [lesson, setLesson] = useState<Lesson>();
  const [resume, setResume] = useState<GameSnapshot>();
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0),
    [dirty, setDirty] = useState(false);
  const [record, setRecord] = useState<FinishRecord>();
  const [receipt, setReceipt] = useState<Receipt>();
  const [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState("");
  const [next, setNext] = useState<Lesson>();
  const current = useRef<GameSnapshot | undefined>(undefined);
  const recordRef = useRef<FinishRecord | undefined>(undefined);
  const confirming = useRef(false),
    mounted = useRef(true);
  const checkpointError = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setGuard(
      () =>
        !dirty ||
        !!record ||
        window.confirm(
          "Rời bài học? Tiến độ đang học sẽ được giữ để bạn tiếp tục sau.",
        ),
    );
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty && !record) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      setGuard(() => true);
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty, record]);
  useEffect(() => {
    const previous = document.title;
    document.title = `${preview ? "Xem thử · " : ""}${lesson?.title || "Đang tải bài"} · HanziOne`;
    return () => {
      document.title = previous;
    };
  }, [lesson, preview]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      let selected: Lesson | undefined;
      if (preview) {
        if (!intent)
          throw new Error(
            "Bản xem thử đã hết phiên. Hãy quay lại Admin hoặc Hành trình và chọn Xem thử lần nữa.",
          );
        selected = intent;
      } else if (route.mode === "practice") {
        selected = intent || manager?.stages.find((s) => s.practice)?.lesson;
        if (!selected) {
          const cached = gameSnapshotSchema.safeParse(
            JSON.parse(localStorage.getItem(cpKey) || "null"),
          );
          if (cached.success && cached.data.practice)
            selected = cached.data.lesson;
        }
        if (!selected)
          throw new Error(
            "Phiên luyện tập không còn khả dụng. Hãy chọn lại trong Luyện tập.",
          );
      } else if (manager) {
        selected = await publishedLesson(route.id);
        if (!selected)
          throw new Error(
            "Bài học không tồn tại, đang ẩn hoặc chưa được xuất bản cho tài khoản này.",
          );
        if (!canStudy(manager.progress, selected, catalog))
          throw new Error(
            "Bài học chưa mở khóa. Hãy hoàn thành các bài tiên quyết trong Hành trình.",
          );
      } else {
        selected = allLessons.find((l) => l.id === route.id);
        if (!selected || selected.learning?.status === "draft")
          throw new Error(
            "Bài học chưa được xuất bản. Đăng nhập để tải bản đã xuất bản hoặc chọn Xem thử từ Hành trình.",
          );
        if (!canStudy(progress, selected, allLessons))
          throw new Error(
            "Bài học chưa mở khóa. Hãy hoàn thành bài trước trong Hành trình.",
          );
      }
      let saved: GameSnapshot | undefined;
      let pending: FinishRecord | undefined;
      if (!preview) {
        try {
          const raw =
            route.sessionId &&
            JSON.parse(
              localStorage.getItem(finishKey(route.sessionId)) || "null",
            );
          if (
            raw &&
            gameSnapshotSchema.safeParse(raw.state).success &&
            raw.state.lesson.id === selected.id
          )
            pending = raw;
          const candidate =
            pending?.state ||
            newestCheckpoint(selected, [
              JSON.parse(localStorage.getItem(cpKey) || "null"),
              manager?.stages.find((s) => s.lesson.id === selected.id),
            ]);
          const parsed = gameSnapshotSchema.safeParse(candidate);
          if (parsed.success && newestCheckpoint(selected, [parsed.data]))
            saved = parsed.data;
        } catch {
          /* An invalid cache never grants access or completion. */
        }
      }
      if (!active) return;
      setLesson(selected);
      setResume(saved);
      if (pending && saved) {
        recordRef.current = pending;
        setRecord(pending);
      }
      setLoading(false);
    })().catch((err) => {
      if (active) {
        setError(
          err instanceof Error
            ? err.message
            : "Không tải được bài. Hãy thử lại.",
        );
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [route.key, retry, owner]);

  function checkpoint(state: GameSnapshot) {
    state = { ...state, checkpointAt: Date.now() };
    current.current = state;
    if (preview || recordRef.current) return;
    rememberSession(state.sessionId);
    setDirty(
      state.screenIndex > 0 || state.step > 0 || state.responses.length > 0,
    );
    try {
      localStorage.setItem(cpKey, JSON.stringify(state));
      if (manager) {
        manager.enqueue([operation("stage", state)]);
        manager.setLocal(manager.progress, [
          state,
          ...manager.stages.filter((s) => s.lesson.id !== state.lesson.id),
        ]);
      }
      if (checkpointError.current) {
        checkpointError.current = false;
        setSaveError("");
      }
    } catch {
      checkpointError.current = true;
      setSaveError(
        "Không lưu được checkpoint. Hãy giữ trang này mở và thử lại khi bộ nhớ khả dụng.",
      );
    }
  }
  async function confirmResult(value = recordRef.current) {
    if (!value || confirming.current || preview) return;
    confirming.current = true;
    setSaving(true);
    setSaveError("");
    try {
      if (manager && supabase) {
        const existing = await supabase
          .from("study_sessions")
          .select("score,xp_earned")
          .eq("operation_id", value.state.sessionId)
          .eq("user_id", manager.userId)
          .maybeSingle();
        if (existing.error) throw existing.error;
        if (
          !existing.data &&
          !manager.queue.some((op) => op.id === value.state.sessionId)
        )
          manager.enqueue(value.ops);
        await manager.flush();
        const result = await supabase
          .from("study_sessions")
          .select("score,xp_earned")
          .eq("operation_id", value.state.sessionId)
          .eq("user_id", manager.userId)
          .maybeSingle();
        if (result.error) throw result.error;
        if (!mounted.current) return;
        if (!result.data) {
          setSaveError(
            manager.error ||
              "Kết quả đang chờ server xác nhận. Giữ kết nối hoặc bấm Thử đồng bộ lại.",
          );
          return;
        }
        setReceipt(result.data);
        onProgress(manager.progress);
      } else {
        const persisted = load();
        const previous = persisted.history.find(
          (h) => h.sessionId === value.state.sessionId,
        );
        let local = previous
          ? { score: previous.accuracy, xp_earned: previous.xp }
          : undefined;
        if (!local) {
          const old = persisted;
          const updated = complete(
            old,
            value.state.lesson.id,
            value.state.score / value.state.questions.length,
            value.seconds,
            value.answers,
          );
          const recall = new Map<string, boolean>();
          if (value.state.wrote)
            updated.written = [...new Set([...old.written, dateKey()])];
          for (const r of Object.values(value.state.recallRatings))
            recall.set(r.hanzi, (recall.get(r.hanzi) ?? true) && r.correct);
          for (const [hanzi, correct] of recall)
            if (!correct || !value.answers.some((a) => a.hanzi === hanzi))
              updated.reviews[hanzi] = schedule(
                updated.reviews[hanzi],
                correct,
              );
          local = {
            score: value.state.score / value.state.questions.length,
            xp_earned: updated.xp - old.xp,
          };
          updated.history[updated.history.length - 1].sessionId =
            value.state.sessionId;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          value.localReceipt = local;
          onProgress(updated);
          localStorage.setItem(
            finishKey(value.state.sessionId),
            JSON.stringify(value),
          );
        }
        setReceipt(local);
      }
      localStorage.removeItem(cpKey);
      setDirty(false);
    } catch (err) {
      if (mounted.current)
        setSaveError(
          err instanceof Error ? err.message : "Chưa lưu được kết quả.",
        );
    } finally {
      confirming.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  async function finish(
    _accuracy: number,
    seconds: number,
    answers: { hanzi: string; correct: boolean }[],
    state: GameSnapshot,
  ) {
    if (recordRef.current?.state.sessionId === state.sessionId) {
      await confirmResult();
      return;
    }
    const ops = [finishOperation(state, seconds)];
    const recall = new Map<string, boolean>();
    const allowed = new Set(state.lesson.words.map((w) => w.hanzi));
    for (const r of Object.values(state.recallRatings))
      if (allowed.has(r.hanzi))
        recall.set(r.hanzi, (recall.get(r.hanzi) ?? true) && r.correct);
    for (const [hanzi, correct] of recall)
      if (!correct || !answers.some((a) => a.hanzi === hanzi))
        ops.push(operation("review", { hanzi, correct }));
    const value = { state, seconds, answers, ops };
    if (!preview) {
      try {
        localStorage.setItem(finishKey(state.sessionId), JSON.stringify(value));
        rememberSession(state.sessionId);
        if (manager && !manager.queue.some((op) => op.id === state.sessionId))
          manager.enqueue(ops);
      } catch {
        setSaveError("Không lưu được kết quả vào hàng đợi. Hãy thử lại.");
        return false;
      }
    }
    recordRef.current = value;
    setRecord(value);
    setDirty(false);
    if (!preview) await confirmResult(value);
  }
  useEffect(() => {
    if (record && !receipt && !preview && manager?.status === "saved")
      void confirmResult();
  }, [record, manager?.status, receipt]);
  useEffect(() => {
    if (!receipt || preview || !lesson) return;
    let active = true;
    void (async () => {
      if (manager && supabase) {
        const edges = await supabase
          .from("lesson_prerequisites")
          .select("lesson_id")
          .eq("requires_lesson_id", lesson.id);
        if (edges.error) return;
        for (const edge of edges.data || []) {
          const candidate = await publishedLesson(edge.lesson_id);
          if (
            candidate &&
            !manager.progress.completed.includes(candidate.id) &&
            canStudy(manager.progress, candidate, catalog)
          ) {
            if (active) setNext(candidate);
            break;
          }
        }
      } else {
        const candidate = allLessons.find(
          (l) =>
            l.id !== lesson.id &&
            l.learning?.status !== "draft" &&
            !progress.completed.includes(l.id) &&
            canStudy(progress, l, allLessons),
        );
        if (active) setNext(candidate);
      }
    })().catch(() => {
      /* The result remains usable when the next lesson cannot load. */
    });
    return () => {
      active = false;
    };
  }, [receipt, manager?.status, lesson]);
  if (loading || error || !lesson)
    return (
      <main className="learning-page learning-status">
        <section className="card">
          <button
            className="icon-button"
            aria-label="Quay về Hành trình"
            onClick={() => onClose()}
          >
            <X />
          </button>
          <h1>{loading ? "Đang chuẩn bị bài học…" : "Chưa thể mở bài học"}</h1>
          <p role={error ? "alert" : "status"}>
            {error || "Đang kiểm tra bài đã xuất bản và điều kiện mở khóa."}
          </p>
          {error && (
            <button
              className="secondary"
              onClick={() => setRetry((n) => n + 1)}
            >
              Thử tải lại
            </button>
          )}
          <button className="primary" onClick={() => onClose()}>
            Quay lại
          </button>
        </section>
      </main>
    );
  const total = record?.state.questions.length || lesson.questions.length;
  const score = receipt?.score ?? (record ? record.state.score / total : 0);
  const correct = Math.round(score * total);
  const forgotten = [
    ...new Set([
      ...(record?.answers.filter((a) => !a.correct).map((a) => a.hanzi) || []),
      ...Object.values(record?.state.recallRatings || {})
        .filter((r) => !r.correct)
        .map((r) => r.hanzi),
    ]),
  ];
  return (
    <>
      {saveError && !record && (
        <p className="learning-save-warning" role="alert">
          {saveError}
        </p>
      )}
      <Game
        key={route.key}
        lesson={lesson}
        sound={sound}
        practice={route.mode === "practice"}
        previewMode={preview}
        resume={resume}
        pageMode
        onClose={() => onClose()}
        onState={checkpoint}
        onComplete={finish}
        resultContent={
          <div className="learning-result" aria-live="polite">
            <CheckCircle2 size={58} />
            <span className="eyebrow">
              {preview
                ? "KẾT THÚC XEM THỬ"
                : receipt
                  ? "KẾT QUẢ ĐÃ LƯU"
                  : "ĐANG XÁC NHẬN KẾT QUẢ"}
            </span>
            <h1 id="game-title">{lesson.title}</h1>
            <div className="learning-result-stats">
              <div>
                <b>{Math.round(score * 100)}%</b>
                <span>{receipt ? "Điểm đã xác nhận" : "Điểm làm bài"}</span>
              </div>
              <div>
                <b>{receipt ? `+${receipt.xp_earned}` : preview ? "0" : "—"}</b>
                <span>
                  {manager
                    ? "XP từ server"
                    : preview
                      ? "XP · Preview"
                      : "XP trên thiết bị"}
                </span>
              </div>
              <div>
                <b>
                  {correct}/{total}
                </b>
                <span>Đúng · {total - correct} sai</span>
              </div>
            </div>
            {!receipt && !preview && (
              <p>
                {saving
                  ? "Đang gửi kết quả, chưa cộng XP trên giao diện."
                  : "Kết quả đang được giữ để đồng bộ. Chưa xác nhận hoàn thành."}
              </p>
            )}
            {preview && (
              <p>Bản xem thử không ghi XP, checkpoint, tiến độ hoặc SRS.</p>
            )}
            {forgotten.length > 0 && (
              <section>
                <h2>Từ cần ôn lại</h2>
                <div className="learning-review-words">
                  {forgotten.map((hanzi) => (
                    <span key={hanzi} lang="zh">
                      {hanzi}
                    </span>
                  ))}
                </div>
              </section>
            )}
            {saveError && <p role="alert">{saveError}</p>}
          </div>
        }
        resultActions={
          <>
            <button className="secondary" onClick={() => onClose(!preview)}>
              {preview
                ? route.returnPage === "admin"
                  ? "Quay lại Admin"
                  : "Quay lại"
                : "Về Hành trình"}
            </button>
            {!preview && !receipt && (
              <button
                className="primary"
                disabled={saving}
                onClick={() => {
                  const s = current.current;
                  if (recordRef.current) void confirmResult();
                  else if (s)
                    void finish(
                      s.score / s.questions.length,
                      (Date.now() - s.startedAt) / 1000,
                      s.results,
                      s,
                    );
                }}
              >
                <RefreshCw size={17} />
                {saving ? "Đang đồng bộ…" : "Thử đồng bộ lại"}
              </button>
            )}
            {receipt && next && (
              <button className="primary" onClick={() => onNext(next)}>
                Học bài tiếp theo <ArrowRight size={17} />
              </button>
            )}
          </>
        }
      />
    </>
  );
}
