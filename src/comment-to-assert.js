import { parseSync } from "oxc-parser";
import MagicString from "magic-string";

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
  const ast = result.program;
  const comments = result.comments;

  const s = new MagicString(code);
  let changed = false;

  for (const node of ast.body) {
    if (node.type !== "ExpressionStatement") continue;

    const comment = findTrailingComment(comments, node, code);
    if (!comment) continue;

    const isAwait = node.expression.type === "AwaitExpression";

    const match = comment.value.match(/^\s*(=>|→|->)\s*([\s\S]*)$/);
    const throwsMatch = comment.value.match(/^\s*throws\s+([\s\S]*)$/);
    const rejectsMatch = comment.value.match(/^\s*rejects\s+([\s\S]*)$/);

    if (match) {
      const rest = match[2].trim();
      const resolvesMatch = rest.match(/^resolves\s+(?:to\s+)?([\s\S]*)$/);
      const rejectsErrorMatch = rest.match(
        /^rejects\s+((?:[A-Z]\w+)?Error)(?::\s*(.*))?$/,
      );
      changed = true;

      const errorMatch = rest.match(/^((?:[A-Z]\w+)?Error)(?::\s*(.*))?$/);

      if (resolvesMatch) {
        // expr //=> resolves to value → assert.deepEqual(await expr, value)
        const expected = resolvesMatch[1].trim();
        const exprSource = code.slice(
          node.expression.start,
          node.expression.end,
        );
        s.overwrite(
          node.start,
          comment.end,
          `assert.deepEqual(await ${exprSource}, ${expected});`,
        );
      } else if (rejectsErrorMatch) {
        // expr //=> rejects TypeError: msg → assert.rejects(() => expr, { name, message })
        const errorName = rejectsErrorMatch[1];
        const errorMessage = rejectsErrorMatch[2]?.trim();
        const exprSource = code.slice(
          node.expression.start,
          node.expression.end,
        );
        const props = [`name: "${errorName}"`];
        if (errorMessage) {
          props.push(formatMessageProp(errorMessage));
        }
        s.overwrite(
          node.start,
          comment.end,
          isAwait
            ? `await assert.rejects(async () => { ${exprSource}; }, { ${props.join(", ")} });`
            : `await assert.rejects(() => ${exprSource}, { ${props.join(", ")} });`,
        );
      } else if (errorMatch) {
        // expr //=> TypeError: msg → assert.throws(() => { expr }, { name, message })
        // await expr //=> Error: msg → assert.rejects(async () => { expr }, { name, message })
        const errorName = errorMatch[1];
        const errorMessage = errorMatch[2]?.trim();
        const exprSource = code.slice(
          node.expression.start,
          node.expression.end,
        );
        const props = [`name: "${errorName}"`];
        if (errorMessage) {
          props.push(formatMessageProp(errorMessage));
        }
        s.overwrite(
          node.start,
          comment.end,
          isAwait
            ? `await assert.rejects(async () => { ${exprSource}; }, { ${props.join(", ")} });`
            : `assert.throws(() => { ${exprSource}; }, { ${props.join(", ")} });`,
        );
      } else if (isConsoleCall(node.expression)) {
        // console.log(expr) //=> value → keep log, add assertion after.
        // Stay on the same line so subsequent markdown line numbers are
        // preserved for error reporting.
        const arg = code.slice(
          node.expression.arguments[0].start,
          node.expression.arguments[0].end,
        );
        s.overwrite(
          node.expression.end,
          comment.end,
          `; assert.deepEqual(${arg}, ${rest});`,
        );
      } else {
        // expr //=> value → assert.deepEqual(expr, value)
        const exprSource = code.slice(
          node.expression.start,
          node.expression.end,
        );
        s.overwrite(
          node.start,
          comment.end,
          `assert.deepEqual(${exprSource}, ${rest});`,
        );
      }
    } else if (throwsMatch) {
      const pattern = throwsMatch[1].trim();
      const exprSource = code.slice(
        node.expression.start,
        node.expression.end,
      );
      s.overwrite(
        node.start,
        comment.end,
        isAwait
          ? `await assert.rejects(async () => { ${exprSource}; }, ${pattern});`
          : `assert.throws(() => { ${exprSource}; }, ${pattern});`,
      );
      changed = true;
    } else if (rejectsMatch) {
      const pattern = rejectsMatch[1].trim();
      const exprSource = code.slice(
        node.expression.start,
        node.expression.end,
      );
      s.overwrite(
        node.start,
        comment.end,
        isAwait
          ? `await assert.rejects(async () => { ${exprSource}; }, ${pattern});`
          : `await assert.rejects(() => ${exprSource}, ${pattern});`,
      );
      changed = true;
    }
  }

  if (!changed) return { code };

  return { code: s.toString() };
}

/**
 * Find a trailing line comment for an expression statement.
 * The comment must start after the expression and be on the same line.
 */
function findTrailingComment(comments, node, code) {
  for (const c of comments) {
    if (c.type !== "Line") continue;
    if (c.start < node.expression.end) continue;

    // Must be on the same line as the expression (no newline between)
    const between = code.slice(node.expression.end, c.start);
    if (between.includes("\n")) continue;

    return c;
  }
  return null;
}

function formatMessageProp(msg) {
  const reMatch = msg.match(/^\/(.+)\/([gimsuy]*)$/);
  return reMatch
    ? `message: /${reMatch[1]}/${reMatch[2]}`
    : `message: "${msg}"`;
}

function isConsoleCall(expr) {
  return (
    expr.type === "CallExpression" &&
    expr.callee.type === "MemberExpression" &&
    expr.callee.object.type === "Identifier" &&
    expr.callee.object.name === "console"
  );
}
