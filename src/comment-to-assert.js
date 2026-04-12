import { transform } from "./transform.js";
import { assertCommentRe } from "./ast.js";

export function commentToAssert(code, { typescript = false } = {}) {
  if (!assertCommentRe.test(code)) return { code, map: null, isESM: false };
  return transform(code, { typescript });
}
