import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { validateBundle } from "../src/learning/schema";
test("batch scaffold requires 5–10 sourced lessons, records OCR review and never invents publishable content or overwrites output", () => {
  const dir = mkdtempSync(join(tmpdir(), "hanzione-scaffold-"));
  try {
    const manifest = {
      courseId: "qa-book",
      title: "QA only",
      syllabus: { family: "foundation", version: "qa-v1" },
      chapters: [{ id: "qa-chapter", title: "QA", description: "QA only" }],
      lessons: Array.from({ length: 5 }, (_, i) => ({
        id: `qa-scaffold-${i + 1}`,
        chapterId: "qa-chapter",
        title: `QA ${i + 1}`,
        prerequisites: i ? [`qa-scaffold-${i}`] : [],
        source: {
          file: "source.md",
          location: `Đoạn ${i + 1}`,
          scanned: false,
        },
      })),
    };
    const input = join(dir, "manifest.json"),
      output = join(dir, "draft.json");
    const run = () =>
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/scaffold-curriculum-batch.ts",
          input,
          output,
        ],
        { stdio: "pipe" },
      );
    writeFileSync(input, JSON.stringify(manifest));
    assert.throws(run, /SOURCE_NOT_FOUND/);
    writeFileSync(
      join(dir, "source.md"),
      "Tài liệu QA chỉ để kiểm thử, không phải giáo trình.",
    );
    run();
    const draft = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(draft.lessons.length, 5);
    assert.equal(draft.status, "draft");
    assert.ok(
      draft.lessons.every(
        (l: any) =>
          l.screens.length === 7 &&
          l.screens.find((s: any) => s.kind === "vocabulary").words.length ===
            0,
      ),
    );
    assert.throws(() => validateBundle(draft));
    assert.equal(
      JSON.parse(readFileSync(output + ".review.json", "utf8")).status,
      "needs_human_review",
    );
    assert.throws(run, /OUTPUT_EXISTS_DO_NOT_OVERWRITE/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
