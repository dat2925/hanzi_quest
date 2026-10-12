import { useState } from "react";
import type { Screen } from "./schema";
import { speak, WritingPad } from "../Game";
export function TeachingScreen({
  screen: s,
  sound,
  wrote,
  onWrote,
}: {
  screen: Screen;
  sound: boolean;
  wrote: boolean;
  onWrote: (value: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
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
      {s.examples.map((x, i) => (
        <p className="lesson-example" key={i}>
          <strong lang="zh">{x.hanzi}</strong> · {x.pinyin}
          <br />
          {x.meaning}
        </p>
      ))}
      {s.kind === "vocabulary" && (
        <div className="word-tiles">
          {s.words.map((w) => (
            <button
              key={w.hanzi}
              onClick={() => speak(w.hanzi, sound, setError)}
            >
              <b lang="zh">{w.hanzi}</b>
              <span>
                {w.pinyin} · thanh {w.tones.join(", ")}
              </span>
              <small>{w.meaning}</small>
              <small>
                {w.example.hanzi} · {w.example.pinyin} · {w.example.meaning}
              </small>
            </button>
          ))}
        </div>
      )}
      {"speech" in s && s.speech && (
        <button
          className="listen-button"
          onClick={() => speak(s.speech!, sound, setError)}
        >
          Nghe phát âm
        </button>
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
