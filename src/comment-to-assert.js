import { parseSync } from "oxc-parser";
import MagicString from "magic-string";
import { applyAssertions } from "./transform.js";

/**
 * Transform assertion comments into assert calls.
 *
 *   expr //=> value        → assert.deepEqual(expr, value)
 *   expr // → value        → assert.deepEqual(expr, value)
 *   expr // throws /pat/   → assert.throws(() => { expr }, /pat/)
 *   expr //=> Error: msg   → assert.throws(() => { expr }, { message: "msg" })
 *   console.log(x) //=> v  → console.log(x); assert.deepEqual(x, v)
 *   expr //=> resolves to v → assert.deepEqual(await expr, v)
 *   expr // rejects /pat/  → assert.rejects(() => expr, /pat/)
 *   expr //=> rejects Error: msg → assert.rejects(() => expr, { message: "msg" })
 *
 * When the expression is an AwaitExpression, throws/Error assertions are
 * promoted to async rejects (await converts rejection → throw).
 *
 * Uses oxc-parser for AST + comment extraction. Handles both JS and TS.
 *
 * @param {string} code - JavaScript or TypeScript source
 * @param {{ typescript?: boolean }} options
 * @returns {{ code: string }}
 */
export function commentToAssert(code, { typescript = false } = {}) {
  const ext = typescript ? "test.ts" : "test.js";
  const result = parseSync(ext, code);
  const s = new MagicString(code);
  const changed = applyAssertions(s, result.program, result.comments, code);
  if (!changed) return { code };
  return { code: s.toString() };
}
