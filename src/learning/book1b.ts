import raw from "../../curriculum/book1-lesson1b.json" with { type: "json" };
import { validateBundle } from "./schema";
import { compileBundle } from "./adapter";
export const book1b = validateBundle(raw);
export const lesson1b = compileBundle(book1b)[0];
