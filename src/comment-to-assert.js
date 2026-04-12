import { transform } from "./transform.js";

const assertRe = /\/\/\s*(=>|→|->|throws|rejects)/;

export function commentToAssert(code, { typescript = false } = {}) {
  if (!assertRe.test(code)) return { code, map: null, isESM: false };
  return transform(code, { typescript });
}
