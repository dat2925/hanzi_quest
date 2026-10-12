import raw from "../../curriculum/book1-lesson1a.json" with { type: "json" };
import { validateBundle } from "./schema";
import { compileBundle } from "./adapter";
export const book1 = validateBundle(raw);
export const lesson1a = compileBundle(book1)[0];
