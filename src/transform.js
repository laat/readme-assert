import { parseSync } from "oxc-parser";
import { print } from "esrap";
import ts from "esrap/languages/ts";

export function transform(code, {
  typescript = false,
  renameImports = null,
  hoistImports = false,
  requireMode = false,
  sourceMapSource = null,
} = {}) {
  const ext = typescript ? "test.ts" : "test.js";
  const result = parseSync(ext, code);
  const ast = result.program;
  const comments = result.comments;

  addLoc(ast, code);

  let isESM = false;
  if (hoistImports) {
    isESM = doHoist(ast, code, renameImports, requireMode);
  }

  applyAssertions(ast, comments, code);

  const printed = print(ast, ts(), {
    sourceMapSource: sourceMapSource || undefined,
    sourceMapContent: sourceMapSource ? code : undefined,
  });
  return { code: printed.code, map: printed.map, isESM };
}

function doHoist(ast, code, resolve, requireMode) {
  const declarations = [];
  const body = [];

  for (const node of ast.body) {
    if (isDeclaration(node)) {
      if (resolve) renameSpecifiers(node, resolve);
      declarations.push(node);
    } else {
      body.push(node);
    }
  }

  // Rename require() calls in body
  if (resolve) {
    for (const call of findRequireCalls({ body })) {
      const arg = call.arguments[0];
      const newPath = resolve(arg.value);
      if (newPath) {
        arg.value = newPath;
        arg.raw = JSON.stringify(newPath);
      }
    }
  }

  const hasESM = declarations.length > 0;
  const hasAwait = body.some((n) => containsNodeType(n, "AwaitExpression"));
  const hasCJS = !hasAwait && !hasESM && findRequireCalls({ body }).length > 0;

  let assertCode;
  let isESM;
  if (hasESM) {
    assertCode = 'import assert from "node:assert/strict";';
    isESM = true;
  } else if (hasCJS || requireMode) {
    assertCode = 'const assert = require("node:assert/strict");';
    isESM = false;
  } else {
    assertCode = 'const { default: assert } = await import("node:assert/strict");';
    isESM = true;
  }

  const assertNode = parseSync("t.js", assertCode).program.body[0];
  ast.body = [assertNode, ...declarations, ...body];

  return isESM;
}

function renameSpecifiers(node, resolve) {
  const source = getSourceNode(node);
  if (source) {
    const newPath = resolve(source.value);
    if (newPath) {
      source.value = newPath;
      source.raw = JSON.stringify(newPath);
    }
  }
  for (const call of findRequireCalls(node)) {
    const arg = call.arguments[0];
    const newPath = resolve(arg.value);
    if (newPath) {
      arg.value = newPath;
      arg.raw = JSON.stringify(newPath);
    }
  }
}

function applyAssertions(ast, comments, code) {
  for (let i = 0; i < ast.body.length; i++) {
    const node = ast.body[i];
    if (node.type !== "ExpressionStatement") continue;

    const comment = findTrailingComment(comments, node, code);
    if (!comment) continue;

    const isAwait = node.expression.type === "AwaitExpression";
    const exprSource = code.slice(node.expression.start, node.expression.end);

    const match = comment.value.match(/^\s*(=>|→|->)\s*([\s\S]*)$/);
    const throwsMatch = comment.value.match(/^\s*throws\s+([\s\S]*)$/);
    const rejectsMatch = comment.value.match(/^\s*rejects\s+([\s\S]*)$/);

    let replacement;

    if (match) {
      const rest = match[2].trim();
      const resolvesMatch = rest.match(/^resolves\s+(?:to\s+)?([\s\S]*)$/);
      const rejectsErrorMatch = rest.match(
        /^rejects\s+((?:[A-Z]\w+)?Error)(?::\s*(.*))?$/,
      );
      const errorMatch = rest.match(/^((?:[A-Z]\w+)?Error)(?::\s*(.*))?$/);

      if (resolvesMatch) {
        const expected = resolvesMatch[1].trim();
        replacement = `assert.deepEqual(await ${exprSource}, ${expected});`;
      } else if (rejectsErrorMatch) {
        const errorName = rejectsErrorMatch[1];
        const errorMessage = rejectsErrorMatch[2]?.trim();
        const props = [`name: "${errorName}"`];
        if (errorMessage) props.push(formatMessageProp(errorMessage));
        replacement = isAwait
          ? `await assert.rejects(async () => { ${exprSource}; }, { ${props.join(", ")} });`
          : `await assert.rejects(() => ${exprSource}, { ${props.join(", ")} });`;
      } else if (errorMatch) {
        const errorName = errorMatch[1];
        const errorMessage = errorMatch[2]?.trim();
        const props = [`name: "${errorName}"`];
        if (errorMessage) props.push(formatMessageProp(errorMessage));
        replacement = isAwait
          ? `await assert.rejects(async () => { ${exprSource}; }, { ${props.join(", ")} });`
          : `assert.throws(() => { ${exprSource}; }, { ${props.join(", ")} });`;
      } else if (isConsoleCall(node.expression)) {
        const arg = code.slice(
          node.expression.arguments[0].start,
          node.expression.arguments[0].end,
        );
        replacement = `console.log(${arg}); assert.deepEqual(${arg}, ${rest});`;
      } else {
        replacement = `assert.deepEqual(${exprSource}, ${rest});`;
      }
    } else if (throwsMatch) {
      const pattern = throwsMatch[1].trim();
      replacement = isAwait
        ? `await assert.rejects(async () => { ${exprSource}; }, ${pattern});`
        : `assert.throws(() => { ${exprSource}; }, ${pattern});`;
    } else if (rejectsMatch) {
      const pattern = rejectsMatch[1].trim();
      replacement = isAwait
        ? `await assert.rejects(async () => { ${exprSource}; }, ${pattern});`
        : `await assert.rejects(() => ${exprSource}, ${pattern});`;
    }

    if (replacement) {
      const snippet = parseSync("t.js", replacement);
      const newNodes = snippet.program.body;
      // Stamp loc from original node so sourcemap points to the markdown line
      for (const n of newNodes) stampLoc(n, node.loc);
      ast.body.splice(i, 1, ...newNodes);
      i += newNodes.length - 1;
    }
  }
}

export { applyAssertions };

// --- loc helpers ---

function addLoc(node, source) {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") lineStarts.push(i + 1);
  }
  function toLC(offset) {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - lineStarts[lo] };
  }
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if ("start" in n && "end" in n && "type" in n) {
      n.loc = { start: toLC(n.start), end: toLC(n.end) };
    }
    for (const key of Object.keys(n)) {
      if (key === "parent" || key === "loc") continue;
      const val = n[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === "object" && item.type) walk(item);
        }
      } else if (val && typeof val === "object" && val.type) {
        walk(val);
      }
    }
  })(node);
}

function stampLoc(node, loc) {
  if (!node || typeof node !== "object") return;
  if ("type" in node) node.loc = loc;
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc") continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) stampLoc(item, loc);
    } else if (val && typeof val === "object" && val.type) {
      stampLoc(val, loc);
    }
  }
}

// --- AST helpers ---

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
