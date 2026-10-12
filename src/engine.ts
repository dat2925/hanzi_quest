export function shuffle<T>(items: T[], random = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
import type { Question, Word } from "./data";

// Assess recall targets, never the distractors displayed next to them.
export function assessedWords(question: Question, words: Word[]): Word[] {
  if (question.type === "listen")
    return words.filter((w) => w.hanzi === question.audio);
  if (question.type === "match")
    return words.filter((w) =>
      question.options.some((pair) => pair.split("|")[0] === w.hanzi),
    );
  if (question.type === "sentence")
    return words.filter((w) => question.answer.includes(w.hanzi));
  if (question.type === "tone")
    return words.filter(
      (w) =>
        question.prompt.includes(w.pinyin) ||
        question.answer === w.pinyin ||
        question.answer.startsWith(w.pinyin + " "),
    );
  return words.filter(
    (w) =>
      question.prompt.includes(w.hanzi) ||
      question.answer === w.hanzi ||
      question.answer === w.pinyin ||
      question.answer === w.meaning,
  );
}
