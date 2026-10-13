import { useEffect, useState } from "react";
import { RecallCards } from "./RecallCards";
import type { Screen } from "./schema";
import { speak, WritingPad } from "../Game";
export function TeachingScreen({
  screen: s,
  sound,
  wrote,
  onWrote,
  ratings = {},
  onRate = () => {},
}: {
  screen: Screen;
  sound: boolean;
  wrote: boolean;
  onWrote: (value: boolean) => void;
  ratings?: Record<string, { hanzi: string; correct: boolean }>;
  onRate?: (id: string, hanzi: string, correct: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [showPinyin, setShowPinyin] = useState(true);
  const [showModel, setShowModel] = useState(true);
  useEffect(() => {
    if (s.kind === "recall") onWrote(s.cards.every((c) => !!ratings[c.id]));
  }, [s, ratings, onWrote]);
  return (
    <>
      <span className="eyebrow">
        {s.kind === "notebook"
          ? "VIẾT VÀO VỞ"
          : s.kind === "srs"
            ? "LỊCH ÔN TẬP"
            : "HỌC TỪNG BƯỚC"}
      </span>
      <h2 id="game-title">{s.title}</h2>
      <p className="game-guide">{s.body}</p>
      {s.theory && <p className="note-box">{s.theory}</p>}
      {(s.kind === "vocabulary" || s.kind === "pronunciation") && (
        <button
          className="text-button"
          onClick={() => setShowPinyin(!showPinyin)}
        >
          {showPinyin ? "Ẩn Pinyin" : "Hiện Pinyin"}
        </button>
      )}
      {s.kind === "notebook" && (
        <button className="secondary" onClick={() => setShowModel(!showModel)}>
          {showModel ? "Che mẫu để tự viết" : "Hiện mẫu để đối chiếu"}
        </button>
      )}
      {s.image && (
        <img
          className="lesson-image"
          src={s.image.url}
          alt={s.image.alt}
          loading="lazy"
        />
      )}
      {s.audioUrl && (
        <audio controls src={s.audioUrl} preload="none" aria-label={s.title} />
      )}
      {s.steps.length > 0 && (
        <ol className="lesson-steps">
          {s.steps.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      )}
      {(s.kind !== "notebook" || showModel) &&
        s.examples.map((x, i) => (
          <div className="lesson-example" key={i}>
            <strong lang="zh">{x.hanzi}</strong>{" "}
            {showPinyin && <>· {x.pinyin}</>}
            <br />
            {x.meaning}
            {s.kind === "pronunciation" && s.listenToExamples && (
              <div className="row">
                <button
                  className="text-button"
                  onClick={() => speak(x.hanzi, sound, setError)}
                >
                  Nghe ví dụ {i + 1}
                </button>
                <button
                  className="text-button"
                  onClick={() => speak(x.hanzi, sound, setError, 0.5)}
                >
                  Nghe chậm ví dụ {i + 1}
                </button>
              </div>
            )}
          </div>
        ))}
      {s.kind === "vocabulary" && (
        <div className="word-tiles">
          {s.words.map((w) => (
            <div key={w.hanzi}>
              <button onClick={() => speak(w.hanzi, sound, setError)}>
                <b lang="zh">{w.hanzi}</b>
                {showPinyin && (
                  <span>
                    {w.pinyin} · thanh {w.tones.join(", ")}
                  </span>
                )}
                <small>{w.meaning}</small>
                <small>
                  {w.example.hanzi} {showPinyin && <>· {w.example.pinyin}</>} ·{" "}
                  {w.example.meaning}
                </small>
              </button>
              <button
                className="text-button"
                onClick={() => speak(w.hanzi, sound, setError, 0.5)}
              >
                Nghe chậm {w.hanzi}
              </button>
            </div>
          ))}
        </div>
      )}
      {"speech" in s && s.speech && (
        <>
          <button
            className="listen-button"
            onClick={() => speak(s.speech!, sound, setError)}
          >
            Nghe phát âm
          </button>
          <button
            className="text-button"
            onClick={() => speak(s.speech!, sound, setError, 0.5)}
          >
            Nghe chậm
          </button>
          <p className="muted">
            Tự nghe và đọc theo. Ứng dụng chưa chấm phát âm.
          </p>
        </>
      )}
      {s.kind === "recall" && (
        <RecallCards
          cards={s.cards}
          sound={sound}
          ratings={ratings}
          onRate={onRate}
          onDone={onWrote}
        />
      )}
      {s.kind === "notebook" && (
        <>
          <WritingPad />
          {s.checklist.map((item) => (
            <label className="checkline" key={item}>
              <input
                type="checkbox"
                checked={wrote || checked.includes(item)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...checked, item]
                    : checked.filter((x) => x !== item);
                  setChecked(next);
                  onWrote(next.length === s.checklist.length);
                }}
              />
              {item}
            </label>
          ))}
        </>
      )}
      <p role="status">{error}</p>
    </>
  );
}
