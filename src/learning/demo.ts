import raw from "../../curriculum/beginner.json" with { type: "json" };
import { validateBundle } from "./schema";
import { adaptLesson } from "./adapter";
export const beginner = validateBundle(raw);
export const demo = adaptLesson(beginner.lessons[0]);
