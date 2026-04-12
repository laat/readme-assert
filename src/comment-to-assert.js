import { parseSync } from "oxc-parser";
import MagicString from "magic-string";
import { applyAssertions } from "./transform.js";

export function commentToAssert(code, { typescript = false } = {}) {
  const ext = typescript ? "test.ts" : "test.js";
  const result = parseSync(ext, code);
  const s = new MagicString(code);
  applyAssertions(s, result.program, result.comments, code);
  if (!s.hasChanged()) return { code };
  return { code: s.toString() };
}
