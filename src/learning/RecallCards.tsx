import { useState } from "react";
import type { Screen } from "./schema";
import { speak } from "../Game";
type Card = Extract<Screen, { kind: "recall" }>["cards"][number];
export function RecallCards({
  cards,
  sound,
  onRate,
  onDone,
  ratings = {},
}: {
  cards: Card[];
  sound: boolean;
  onRate: (id: string, hanzi: string, correct: boolean) => void;
  onDone: (done: boolean) => void;
  ratings?: Record<string, { hanzi: string; correct: boolean }>;
}) {
  const [index, setIndex] = useState(() => {
    const first = cards.findIndex((c) => !ratings[c.id]);
    return first < 0 ? cards.length : first;
  });
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [error, setError] = useState("");
  const card = cards[index];
  if (!card)
    return (
      <p role="status">
        Đã tự nhớ đủ {cards.length} thẻ. Tự đánh giá không cộng XP.
      </p>
    );
  return (
    <section className="recall-card" aria-label="Thẻ tự nhớ">
      <p>
        Thẻ {index + 1}/{cards.length} · Nói hoặc viết câu trả lời trước khi lật
        thẻ.
      </p>
      <h3>{card.prompt}</h3>
      <button className="text-button" onClick={() => setHint(true)}>
        Gợi ý tự nhớ
      </button>
      {hint && <p>{card.hint}</p>}
      {!revealed ? (
        <button className="secondary" onClick={() => setRevealed(true)}>
          Mình đã thử nhớ · Xem đáp án
        </button>
      ) : (
        <>
          <p className="lesson-example" data-testid="recall-answer">
            {card.answer}
          </p>
          <button
            className="text-button"
            onClick={() => speak(card.hanzi, sound, setError)}
          >
            Nghe lại đáp án
          </button>
          <div className="row">
            {[false, true].map((correct) => (
              <button
                className="secondary"
                key={String(correct)}
                onClick={() => {
                  onRate(card.id, card.hanzi, correct && !hint);
                  setIndex(index + 1);
                  setRevealed(false);
                  setHint(false);
                  if (index + 1 === cards.length) onDone(true);
                }}
              >
                {correct ? "Nhớ được" : "Chưa nhớ"}
              </button>
            ))}
          </div>
          <p className="muted">
            Có gợi ý: lên lịch ôn sớm. Không chấm giọng nói hoặc chữ viết.
          </p>
        </>
      )}
      <p role="status">{error}</p>
    </section>
  );
}
