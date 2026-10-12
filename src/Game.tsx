import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Volume2,
  X,
  RotateCcw,
  BookOpen,
  Star,
} from "lucide-react";
import type { Lesson, Question } from "./data";
import { Panda } from "./Art";
import { shuffle, assessedWords } from "./engine";
export function speak(
  text: string,
  enabled = true,
  onError?: (message: string) => void,
) {
  if (!enabled) {
    onError?.("Âm thanh đang tắt. Bật lại trong Cài đặt.");
    return;
  }
  if (!("speechSynthesis" in window)) {
    onError?.("Thiết bị chưa hỗ trợ đọc tiếng Trung. Hãy đọc theo Pinyin.");
    return;
  }
  const voices = window.speechSynthesis.getVoices();
  const chinese = voices.find((v) => v.lang.startsWith("zh"));
  if (!chinese) {
    onError?.(
      "Thiết bị chưa có giọng tiếng Trung. Hãy cài giọng zh-CN hoặc đọc theo Pinyin.",
    );
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  u.voice = chinese;
  u.rate = 0.75;
  u.onerror = () => onError?.("Không phát được âm thanh. Hãy đọc theo Pinyin.");
  window.speechSynthesis.speak(u);
}
export function WritingPad() {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [count, setCount] = useState(0);
  return (
    <div className="writing-pad">
      <canvas
        ref={ref}
        width={320}
        height={320}
        aria-label="Ô viết thử tự do, không chấm nét tự động"
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const r = e.currentTarget.getBoundingClientRect();
          const c = ref.current!.getContext("2d")!;
          c.beginPath();
          c.moveTo(
            ((e.clientX - r.left) * 320) / r.width,
            ((e.clientY - r.top) * 320) / r.height,
          );
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          const c = ref.current!.getContext("2d")!;
          c.strokeStyle = "#447857";
          c.lineWidth = 7;
          c.lineCap = "round";
          c.lineTo(
            ((e.clientX - r.left) * 320) / r.width,
            ((e.clientY - r.top) * 320) / r.height,
          );
          c.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          setCount((n) => n + 1);
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <div className="row">
        <small>{count} nét thử · Tự đối chiếu mẫu</small>
        <button
          className="text-button"
          onClick={() => {
            ref.current?.getContext("2d")?.clearRect(0, 0, 320, 320);
            setCount(0);
          }}
        >
          <RotateCcw size={15} /> Viết lại
        </button>
      </div>
    </div>
  );
}
function Match({
  q,
  onDone,
}: {
  q: Question;
  onDone: (assisted: boolean) => void;
}) {
  const [left, setLeft] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [assisted, setAssisted] = useState(false);
  const pairs = q.options.map((x) => x.split("|"));
  return (
    <>
      <div className="match-grid">
        <div>
          {pairs.map(([a]) => (
            <button
              key={a}
              disabled={done.includes(a)}
              className={left === a ? "selected" : ""}
              onClick={() => {
                setLeft(a);
                setError("");
              }}
            >
              {done.includes(a) ? "✓ " : ""}
              {a}
            </button>
          ))}
        </div>
        <div>
          {[...pairs].reverse().map(([a, b]) => (
            <button
              key={b}
              disabled={done.includes(a)}
              onClick={() => {
                if (!left) {
                  setError("Chọn một chữ Hán ở bên trái trước nhé.");
                  return;
                }
                if (left === a) {
                  const next = [...done, a];
                  setDone(next);
                  setLeft("");
                  if (next.length === pairs.length) onDone(assisted);
                } else {
                  setAssisted(true);
                  setError("Chưa khớp. Hãy nhớ lại nghĩa và thử tiếp nhé!");
                }
              }}
            >
              {b}
            </button>
          ))}
        </div>
      </div>
      <p role="status">{error}</p>
    </>
  );
}
export default function Game({
  lesson,
  sound,
  onClose,
  onComplete,
  practice = false,
}: {
  lesson: Lesson;
  sound: boolean;
  onClose: () => void;
  onComplete: (
    accuracy: number,
    seconds: number,
    answers: { hanzi: string; correct: boolean }[],
  ) => void;
  practice?: boolean;
}) {
  const [step, setStep] = useState(-1);
  const [selection, setSelection] = useState("");
  const [tokens, setTokens] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<{ hanzi: string; correct: boolean }[]>(
    [],
  );
  const [wrote, setWrote] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [assisted, setAssisted] = useState(false);
  const start = useRef(Date.now());
  const committed = useRef(false);
  const finishRef = useRef<HTMLButtonElement>(null);
  const [questions] = useState(() =>
    lesson.questions.map((q) => ({ ...q, options: shuffle(q.options) })),
  );
  const q = questions[step];
  const writing = step === lesson.questions.length;
  const finished = step > lesson.questions.length;
  function check() {
    if (!selection) return;
    const correct = selection === q.answer && !assisted;
    setFeedback(correct);
    if (correct) setScore((x) => x + 1);
    const assessed = assessedWords(q, lesson.words);
    setResults((x) => [
      ...x,
      ...assessed.map((w) => ({ hanzi: w.hanzi, correct })),
    ]);
  }
  function next() {
    setStep((x) => x + 1);
    setSelection("");
    setTokens([]);
    setFeedback(null);
    setAudioError("");
    setAssisted(false);
  }
  useEffect(() => {
    finishRef.current?.focus();
  }, [step, feedback]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div className="modal-backdrop">
      <section
        className="game-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-title"
      >
        <header className="game-top">
          <button
            className="icon-button"
            aria-label="Đóng bài học"
            onClick={onClose}
          >
            <X />
          </button>
          <div className="progress">
            <i
              style={{
                width: `${(Math.max(0, step + 1) / (lesson.questions.length + 2)) * 100}%`,
              }}
            />
          </div>
          <span>
            <Star size={18} /> {score}
          </span>
        </header>
        <div className="game-body">
          {step === -1 ? (
            <>
              <span className="eyebrow">
                {practice ? "KHU LUYỆN TẬP" : "KHÁM PHÁ BÀI MỚI"} ·{" "}
                {lesson.minutes} PHÚT
              </span>
              <h2 id="game-title">{lesson.title}</h2>
              <p className="game-guide">{lesson.guide}</p>
              <div className="word-tiles">
                {lesson.words.map((w) => (
                  <button
                    key={w.hanzi}
                    onClick={() => speak(w.hanzi, sound, setAudioError)}
                  >
                    <b>{w.hanzi}</b>
                    <span>{w.pinyin}</span>
                    <small>{w.meaning}</small>
                    <Volume2 size={16} />
                  </button>
                ))}
              </div>
              <p className="muted">
                Chạm vào từ để nghe. Đọc to, rồi che nghĩa để thử nhớ lại.
              </p>
              <p role="status">{audioError}</p>
            </>
          ) : finished ? (
            <div className="result">
              <Panda />
              <span className="eyebrow">MỘT BƯỚC NHỎ, MỘT TIẾN BỘ LỚN</span>
              <h2 id="game-title">
                {score === lesson.questions.length
                  ? "Bạn làm tốt lắm!"
                  : "Cứ luyện tập, bạn sẽ nhớ!"}
              </h2>
              <p>
                Đúng {score}/{lesson.questions.length} thử thách ·{" "}
                {Math.round((score / lesson.questions.length) * 100)}% chính xác
              </p>
              <p>
                {practice
                  ? "Kết quả ôn tập sẽ cập nhật lịch nhắc lại của bạn."
                  : "Đạt từ 70% để mở chặng tiếp theo."}{" "}
                Từ đúng được tăng khoảng cách ôn; từ sai ôn sau 10 phút.
              </p>
            </div>
          ) : writing ? (
            <>
              <span className="eyebrow">DỪNG MỘT CHÚT · LẤY VỞ RA NÀO</span>
              <h2 id="game-title">
                Viết để ghi nhớ <BookOpen />
              </h2>
              <p className="game-guide">{lesson.writing}</p>
              <WritingPad />
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={wrote}
                  onChange={(e) => setWrote(e.target.checked)}
                />{" "}
                Mình đã luyện viết và tự đối chiếu với mẫu.
              </label>
              <p className="muted">
                Ô viết là nơi thử nét tự do; ứng dụng chưa nhận diện chữ viết.
              </p>
            </>
          ) : (
            <>
              <span className="eyebrow">
                THỬ THÁCH {step + 1}/{lesson.questions.length} ·{" "}
                {q.type === "listen"
                  ? "LUYỆN NGHE"
                  : q.type === "sentence"
                    ? "GHÉP CÂU"
                    : q.type === "match"
                      ? "GHÉP CẶP"
                      : q.type === "tone"
                        ? "THANH ĐIỆU"
                        : "TỪ VỰNG"}
              </span>
              <h2 id="game-title">{q.prompt}</h2>
              {q.type === "listen" && (
                <>
                  <button
                    className="listen-button"
                    onClick={() => speak(q.audio!, sound, setAudioError)}
                  >
                    <Volume2 size={30} /> Nghe phát âm
                  </button>
                  <details key={step}>
                    <summary>Không nghe được? Xem gợi ý Pinyin</summary>
                    {lesson.words.find((w) => w.hanzi === q.audio)?.pinyin ||
                      q.audio}
                  </details>
                  <p role="status">{audioError}</p>
                </>
              )}
              {q.type === "match" ? (
                <Match
                  key={step}
                  q={q}
                  onDone={(neededRetry) => {
                    setAssisted(neededRetry);
                    setSelection("matched");
                  }}
                />
              ) : q.type === "sentence" ? (
                <>
                  <div className="sentence-answer" aria-label="Câu đã ghép">
                    {tokens.length ? (
                      tokens.map((i, pos) => (
                        <button
                          disabled={feedback !== null}
                          key={i}
                          onClick={() => {
                            const next = tokens.filter((_, n) => n !== pos);
                            setTokens(next);
                            setSelection(
                              next.map((n) => q.options[n]).join(""),
                            );
                          }}
                        >
                          {q.options[i]}
                        </button>
                      ))
                    ) : (
                      <span>Chạm vào các từ theo thứ tự…</span>
                    )}
                  </div>
                  <div className="token-bank">
                    {q.options.map((o, i) => (
                      <button
                        key={i}
                        disabled={tokens.includes(i) || feedback !== null}
                        onClick={() => {
                          const next = [...tokens, i];
                          setTokens(next);
                          setSelection(next.map((n) => q.options[n]).join(""));
                        }}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="answers">
                  {q.options.map((o, i) => (
                    <button
                      disabled={feedback !== null}
                      key={o}
                      className={selection === o ? "selected" : ""}
                      onClick={() => setSelection(o)}
                    >
                      <small>{i + 1}</small>
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {feedback !== null && (
                <div
                  className={`feedback ${feedback ? "correct" : "incorrect"}`}
                  role="status"
                >
                  <b>{feedback ? "✓ Chính xác!" : "Cùng ghi nhớ lại nhé"}</b>
                  <p>
                    {q.explanation}
                    {assisted &&
                      " Lượt này có cặp ghép sai; hãy ôn lại để ghép đúng ngay lần đầu."}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        <footer className="game-footer">
          {finished ? (
            <button
              ref={finishRef}
              className="primary"
              onClick={() => {
                if (committed.current) return;
                committed.current = true;
                onComplete(
                  score / lesson.questions.length,
                  (Date.now() - start.current) / 1000,
                  results,
                );
              }}
            >
              Lưu kết quả & tiếp tục <Check size={18} />
            </button>
          ) : step === -1 ? (
            <button ref={finishRef} className="primary" onClick={next}>
              Mình đã hiểu, thử nào <ArrowRight size={18} />
            </button>
          ) : writing ? (
            <button
              ref={finishRef}
              disabled={!wrote}
              className="primary"
              onClick={next}
            >
              Hoàn thành bài học <Check size={18} />
            </button>
          ) : feedback !== null ? (
            <button ref={finishRef} className="primary" onClick={next}>
              Tiếp tục <ArrowRight size={18} />
            </button>
          ) : (
            <button
              ref={finishRef}
              className="primary"
              disabled={!selection}
              onClick={check}
            >
              Kiểm tra
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
