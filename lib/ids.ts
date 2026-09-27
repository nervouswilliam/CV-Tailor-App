import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
/** Short unique id for resume/profile elements (e.g. "k3f9x2ab"). */
export const newId = customAlphabet(alphabet, 8);
/** Longer id for DB rows. */
export const newRowId = customAlphabet(alphabet, 16);
