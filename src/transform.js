import { parseSync } from "oxc-parser";
import MagicString from "magic-string";

export function transform(code, {
  typescript = false,
  renameImports = null,
  hoistImports = false,
  requireMode = false,
} = {}) {
  const ext = typescript ? "test.ts" : "test.js";
  const result = parseSync(ext, code);
  const ast = result.program;
  const comments = result.comments;
  const s = new MagicString(code);

  let isESM = false;
  if (hoistImports) {
    isESM = doHoist(s, ast, code, renameImports, requireMode);
  }

  applyAssertions(s, ast, comments, code);

  if (!s.hasChanged()) return { code, isESM };
  return { code: s.toString(), isESM };
}

// Returns true if the generated code is ESM (needs .mjs extension).
function doHoist(s, ast, code, resolve, requireMode) {
  const importTexts = [];
  const hoistedRanges = [];

  for (const node of ast.body) {
    if (!isDeclaration(node)) continue;

    let text = code.slice(node.start, node.end);

    // Rename specifiers on a plain-string copy to avoid overlapping
    // MagicString overwrites when we blank the range below.
    if (resolve) {
      text = renameInText(text, node, resolve, code);
    }

    text = text.replace(/\n\s*/g, " ").trimEnd();
    if (!text.endsWith(";")) text += ";";

    importTexts.push(text);
    hoistedRanges.push({ start: node.start, end: node.end });
    s.overwrite(node.start, node.end, "");
  }

  // Find body require() calls (not inside hoisted declarations) — used for
  // both renaming and module-type detection.
  const bodyRequires = findRequireCalls(ast).filter(
    (call) => !hoistedRanges.some((r) => call.arguments[0].start >= r.start && call.arguments[0].end <= r.end),
  );

  if (resolve) {
    for (const call of bodyRequires) {
      const arg = call.arguments[0];
      const newPath = resolve(arg.value);
      if (newPath) {
        const quote = code[arg.start];
        s.overwrite(arg.start, arg.end, quote + newPath + quote);
      }
    }
  }

  const hasESM = importTexts.length > 0;
  const hasAwait = ast.body.some((n) => !isDeclaration(n) && containsNodeType(n, "AwaitExpression"));
  const hasCJS = !hasAwait && !hasESM && bodyRequires.length > 0;

  let assertLine;
  let isESM;
  if (hasESM) {
    assertLine = 'import assert from "node:assert/strict";';
    isESM = true;
  } else if (hasCJS || requireMode) {
    assertLine = 'const assert = require("node:assert/strict");';
    isESM = false;
  } else {
    assertLine = 'const { default: assert } = await import("node:assert/strict");';
    isESM = true;
  }

  const firstNewline = code.indexOf("\n");
  const header = [assertLine, ...importTexts].join(" ");
  if (firstNewline > 0) {
    s.overwrite(0, firstNewline, header);
  } else {
    s.prepend(header);
  }

  return isESM;
}

// Edits a plain-string copy so MagicString only needs one overwrite per node.
function renameInText(text, node, resolve, code) {
  const edits = [];

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

function containsNodeType(node, type) {
  if (!node || typeof node !== "object") return false;
  if (node.type === type) return true;
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object" && item.type && containsNodeType(item, type)) return true;
      }
    } else if (val && typeof val === "object" && val.type) {
      if (containsNodeType(val, type)) return true;
    }
  }
  return false;
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

export function applyAssertions(s, ast, comments, code) {
  for (const node of ast.body) {
    if (node.type !== "ExpressionStatement") continue;

    const comment = findTrailingComment(comments, node, code);
    if (!comment) continue;

    const isAwait = node.expression.type === "AwaitExpression";
    const exprSource = code.slice(node.expression.start, node.expression.end);

    const match = comment.value.match(/^\s*(=>|→|->)\s*([\s\S]*)$/);
    const throwsMatch = comment.value.match(/^\s*throws\s+([\s\S]*)$/);
    const rejectsMatch = comment.value.match(/^\s*rejects\s+([\s\S]*)$/);

    if (match) {
      const rest = match[2].trim();
      const resolvesMatch = rest.match(/^resolves\s+(?:to\s+)?([\s\S]*)$/);
      const rejectsErrorMatch = rest.match(
        /^rejects\s+((?:[A-Z]\w+)?Error)(?::\s*(.*))?$/,
      );
      const errorMatch = rest.match(/^((?:[A-Z]\w+)?Error)(?::\s*(.*))?$/);

      if (resolvesMatch) {
        const expected = resolvesMatch[1].trim();
        s.overwrite(
          node.start,
          comment.end,
          `assert.deepEqual(await ${exprSource}, ${expected});`,
        );
      } else if (rejectsErrorMatch) {
        const errorName = rejectsErrorMatch[1];
        const errorMessage = rejectsErrorMatch[2]?.trim();
        const props = [`name: "${errorName}"`];
        if (errorMessage) props.push(formatMessageProp(errorMessage));
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
        const props = [`name: "${errorName}"`];
        if (errorMessage) props.push(formatMessageProp(errorMessage));
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
        s.overwrite(
          node.start,
          comment.end,
          `assert.deepEqual(${exprSource}, ${rest});`,
        );
      }
    } else if (throwsMatch) {
      const pattern = throwsMatch[1].trim();
      s.overwrite(
        node.start,
        comment.end,
        isAwait
          ? `await assert.rejects(async () => { ${exprSource}; }, ${pattern});`
          : `assert.throws(() => { ${exprSource}; }, ${pattern});`,
      );
    } else if (rejectsMatch) {
      const pattern = rejectsMatch[1].trim();
      s.overwrite(
        node.start,
        comment.end,
        isAwait
          ? `await assert.rejects(async () => { ${exprSource}; }, ${pattern});`
          : `await assert.rejects(() => ${exprSource}, ${pattern});`,
      );
    }
  }
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
