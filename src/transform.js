import { parseSync } from "oxc-parser";
import MagicString from "magic-string";

/**
 * Unified AST-based code transform. Single parse, single MagicString.
 *
 * Performs up to three transformations in one pass:
 *   1. Hoist import/export declarations to line 0 and add assert import
 *   2. Rename package imports to local file paths
 *   3. Transform assertion comments into assert calls
 *
 * @param {string} code
 * @param {{
 *   typescript?: boolean,
 *   renameImports?: ((specifier: string) => string | null) | null,
 *   hoistImports?: boolean,
 * }} options
 * @returns {{ code: string }}
 */
export function transform(code, {
  typescript = false,
  renameImports = null,
  hoistImports = false,
} = {}) {
  const ext = typescript ? "test.ts" : "test.js";
  const result = parseSync(ext, code);
  const ast = result.program;
  const comments = result.comments;
  const s = new MagicString(code);

  if (hoistImports) {
    doHoist(s, ast, code, renameImports);
  }

  applyAssertions(s, ast, comments, code);

  if (!s.hasChanged()) return { code };
  return { code: s.toString() };
}

// ---------------------------------------------------------------------------
// Phase 1 + 2: Import hoisting with inline renaming
// ---------------------------------------------------------------------------

function doHoist(s, ast, code, resolve) {
  const importTexts = [];
  const hoistedRanges = [];

  for (const node of ast.body) {
    if (!isDeclaration(node)) continue;

    let text = code.slice(node.start, node.end);

    // Rename module specifiers inside this declaration (text-based to avoid
    // overlapping MagicString overwrites when we blank the range below).
    if (resolve) {
      text = renameInText(text, node, resolve, code);
    }

    // Collapse multi-line declarations to a single line (preserves line count)
    // and ensure a trailing semicolon (fixes ASI bug when joining on line 0).
    text = text.replace(/\n\s*/g, " ").trimEnd();
    if (!text.endsWith(";")) text += ";";

    importTexts.push(text);
    hoistedRanges.push({ start: node.start, end: node.end });
    s.overwrite(node.start, node.end, "");
  }

  // Rename require() calls in the body (not inside hoisted declarations).
  if (resolve) {
    for (const call of findRequireCalls(ast)) {
      const arg = call.arguments[0];
      if (hoistedRanges.some((r) => arg.start >= r.start && arg.end <= r.end)) {
        continue;
      }
      const newPath = resolve(arg.value);
      if (newPath) {
        const quote = code[arg.start];
        s.overwrite(arg.start, arg.end, quote + newPath + quote);
      }
    }
  }

  // Determine assert import style
  const hasESM = importTexts.length > 0;
  const hasAwait = /\bawait\s/.test(code);
  const hasCJS = !hasAwait && !hasESM && /\brequire\s*\(/.test(code);

  let assertLine;
  if (hasESM) {
    assertLine = 'import assert from "node:assert/strict";';
  } else if (hasCJS) {
    assertLine = 'const assert = require("node:assert/strict");';
  } else {
    assertLine = 'const { default: assert } = await import("node:assert/strict");';
  }

  // Place header on line 0.  generate.js writes a single space on line 0 as a
  // slot for the header; overwrite it so the line count stays the same.
  const firstNewline = code.indexOf("\n");
  const header = [assertLine, ...importTexts].join(" ");
  if (firstNewline > 0) {
    s.overwrite(0, firstNewline, header);
  } else {
    s.prepend(header);
  }
}

/**
 * Rename module specifiers inside a declaration's source text.
 * Edits a plain-string copy so MagicString only needs one overwrite per node.
 */
function renameInText(text, node, resolve, code) {
  const edits = [];

  // Source literal on import / re-export declarations
  const source = getSourceNode(node);
  if (source) {
    const newPath = resolve(source.value);
    if (newPath) {
      edits.push({
        localStart: source.start - node.start,
        localEnd: source.end - node.start,
        quote: code[source.start],
        newPath,
      });
    }
  }

  // Nested require() calls (e.g. export default require("pkg"))
  for (const call of findRequireCalls(node)) {
    const arg = call.arguments[0];
    const newPath = resolve(arg.value);
    if (newPath) {
      edits.push({
        localStart: arg.start - node.start,
        localEnd: arg.end - node.start,
        quote: code[arg.start],
        newPath,
      });
    }
  }

  // Apply right-to-left so earlier positions stay valid
  edits.sort((a, b) => b.localStart - a.localStart);
  for (const e of edits) {
    text = text.slice(0, e.localStart) + e.quote + e.newPath + e.quote + text.slice(e.localEnd);
  }
  return text;
}

function isDeclaration(node) {
  return (
    node.type === "ImportDeclaration" ||
    node.type === "ExportNamedDeclaration" ||
    node.type === "ExportDefaultDeclaration" ||
    node.type === "ExportAllDeclaration"
  );
}

function getSourceNode(node) {
  if (node.type === "ImportDeclaration") return node.source;
  if (node.type === "ExportNamedDeclaration" && node.source) return node.source;
  if (node.type === "ExportAllDeclaration") return node.source;
  return null;
}

function findRequireCalls(node, results = []) {
  if (!node || typeof node !== "object") return results;
  if (
    node.type === "CallExpression" &&
    node.callee?.type === "Identifier" &&
    node.callee.name === "require" &&
    node.arguments?.length >= 1 &&
    (node.arguments[0].type === "StringLiteral" || node.arguments[0].type === "Literal") &&
    typeof node.arguments[0].value === "string"
  ) {
    results.push(node);
  }
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object" && item.type) {
          findRequireCalls(item, results);
        }
      }
    } else if (val && typeof val === "object" && val.type) {
      findRequireCalls(val, results);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Phase 3: Assertion comment transformation
// ---------------------------------------------------------------------------

/**
 * Transform assertion comments into assert calls on a pre-parsed AST.
 * Operates on the given MagicString instance.
 *
 * @returns {boolean} true if any changes were made
 */
export function applyAssertions(s, ast, comments, code) {
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

  return changed;
}

function findTrailingComment(comments, node, code) {
  for (const c of comments) {
    if (c.type !== "Line") continue;
    if (c.start < node.expression.end) continue;
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
    : `message: ${JSON.stringify(msg)}`;
}

function isConsoleCall(expr) {
  return (
    expr.type === "CallExpression" &&
    expr.callee.type === "MemberExpression" &&
    expr.callee.object.type === "Identifier" &&
    expr.callee.object.name === "console"
  );
}
