import test from "node:test";
import assert from "node:assert/strict";
import { assessedWords } from "../src/engine";
import { lessons } from "../src/data";
test("listening assesses the spoken target, not distractors", () => {
  const lesson = lessons[0];
  assert.deepEqual(
    assessedWords(lesson.questions[1], lesson.words).map((w) => w.hanzi),
    ["谢谢"],
  );
});
test("greeting recognition assesses only the correct greeting", () => {
  const lesson = lessons[0];
  assert.deepEqual(
    assessedWords(lesson.questions[0], lesson.words).map((w) => w.hanzi),
    ["你好"],
  );
});
test("tone tasks associate pinyin with the correct learning word", () => {
  const lesson = lessons[2];
  assert.deepEqual(
    assessedWords(lesson.questions[0], lesson.words).map((w) => w.hanzi),
    ["妈"],
  );
  assert.deepEqual(
    assessedWords(lesson.questions[2], lesson.words).map((w) => w.hanzi),
    ["骂"],
  );
});
