// Intentionally incomplete: source material must supply words, explanations and assessments.
// Never import/publish this scaffold until Zod and pedagogical validation pass.
export function lessonScaffold(
  id: string,
  chapterId: string,
  prerequisite: string[] = [],
) {
  const common = (id: string, title: string) => ({
    id,
    title,
    body: "Điền lời giảng viết lại từ nguồn đã được kiểm tra.",
    introduces: [],
    examples: [],
    steps: [],
  });
  return {
    schemaVersion: 2,
    id,
    chapterId,
    title: "Bản nháp chưa biên soạn",
    description: "Điền mục tiêu và phạm vi từ tài liệu nguồn.",
    minutes: 15,
    difficulty: 1,
    status: "draft",
    prerequisites: prerequisite,
    screens: [
      {
        ...common("welcome", "1/7 · Mục tiêu"),
        kind: "objective",
        theory: "Điền lý thuyết trước khi hỏi.",
      },
      {
        ...common("pronunciation", "2/7 · Phát âm và nghe"),
        kind: "pronunciation",
      },
      { ...common("words", "3/7 · Từ mới"), kind: "vocabulary", words: [] },
      { ...common("recall", "4/7 · Tự nhớ"), kind: "recall", cards: [] },
      {
        ...common("notebook", "5/7 · Viết vào vở"),
        kind: "notebook",
        checklist: [],
      },
      { ...common("check", "6/7 · Kiểm tra"), kind: "assessment", items: [] },
      { ...common("srs", "7/7 · Ôn SRS"), kind: "srs" },
    ],
  };
}
