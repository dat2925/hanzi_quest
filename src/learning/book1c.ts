import raw from "../../curriculum/book1-lesson1c.json" with { type: "json" };
import { validateBundle } from "./schema";
import { compileBundle } from "./adapter";
export const book1c = validateBundle(raw);
export const lesson1c = compileBundle(book1c)[0];
