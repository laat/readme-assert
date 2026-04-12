import { parseSync } from "oxc-parser";
import { print } from "esrap";
import ts from "esrap/languages/ts";
import { addLoc, stampLoc, walkAst } from "./loc.js";

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
  let hasAwait = false;
  let hasRequire = false;
  for (const node of body) {
    walkAst(node, (n) => {
      if (n.type === "AwaitExpression") hasAwait = true;
      if (isRequireCall(n)) hasRequire = true;
    });
  }
  const hasCJS = !hasAwait && !hasESM && hasRequire;

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
    const expr = node.expression;

    const match = comment.value.match(/^\s*(=>|→|->)\s*([\s\S]*)$/);
    const throwsMatch = comment.value.match(/^\s*throws\s+([\s\S]*)$/);
    const rejectsMatch = comment.value.match(/^\s*rejects\s+([\s\S]*)$/);

    let newNodes;

    if (match) {
      const rest = match[2].trim();
      if (!rest) continue;
      const resolvesMatch = rest.match(/^resolves\s+(?:to\s+)?([\s\S]*)$/);
      const rejectsErrorMatch = rest.match(
        /^rejects\s+((?:[A-Z]\w+)?Error)(?::\s*(.*))?$/,
      );
      const errorMatch = rest.match(/^((?:[A-Z]\w+)?Error)(?::\s*(.*))?$/);

      if (resolvesMatch) {
        const val = parseExpr(resolvesMatch[1].trim());
        newNodes = [stmt(assertCall("deepEqual", [awaitNode(expr), val]))];
      } else if (rejectsErrorMatch) {
        const matcher = errorMatcher(rejectsErrorMatch[1], rejectsErrorMatch[2]?.trim());
        newNodes = [throwsOrRejects(expr, matcher, { isAwait, useRejects: true })];
      } else if (errorMatch) {
        const matcher = errorMatcher(errorMatch[1], errorMatch[2]?.trim());
        newNodes = [throwsOrRejects(expr, matcher, { isAwait, useRejects: false })];
      } else if (isConsoleCall(expr)) {
        const arg = expr.arguments[0];
        const val = parseExpr(rest);
        newNodes = [node, stmt(assertCall("deepEqual", [arg, val]))];
      } else {
        const val = parseExpr(rest);
        newNodes = [stmt(assertCall("deepEqual", [expr, val]))];
      }
    } else if (throwsMatch) {
      const matcher = parseExpr(throwsMatch[1].trim());
      newNodes = [throwsOrRejects(expr, matcher, { isAwait, useRejects: false })];
    } else if (rejectsMatch) {
      const matcher = parseExpr(rejectsMatch[1].trim());
      newNodes = [throwsOrRejects(expr, matcher, { isAwait, useRejects: true })];
    }

    if (newNodes) {
      for (const n of newNodes) stampLoc(n, node.loc);
      ast.body.splice(i, 1, ...newNodes);
      i += newNodes.length - 1;
    }
  }
}

export { applyAssertions };

// --- AST node builders ---

function parseExpr(text) {
  const expr = parseSync("t.js", `(${text})`, { preserveParens: false }).program.body[0].expression;
  return expr.type === "ParenthesizedExpression" ? expr.expression : expr;
}

function id(name) {
  return { type: "Identifier", name };
}

function literal(value) {
  return { type: "Literal", value, raw: JSON.stringify(value) };
}

function member(obj, prop) {
  return { type: "MemberExpression", object: obj, property: id(prop), computed: false, optional: false };
}

function call(callee, args) {
  return { type: "CallExpression", callee, arguments: args };
}

function stmt(expr) {
  return { type: "ExpressionStatement", expression: expr };
}

function awaitNode(arg) {
  return { type: "AwaitExpression", argument: arg };
}

function arrow(body, { async: isAsync = false, expression = false } = {}) {
  return {
    type: "ArrowFunctionExpression",
    params: [],
    body: expression ? body : { type: "BlockStatement", body },
    async: isAsync,
    expression,
  };
}

function prop(key, value) {
  return { type: "Property", key: id(key), value, kind: "init", computed: false, method: false, shorthand: false };
}

function obj(properties) {
  return { type: "ObjectExpression", properties };
}

function assertCall(method, args) {
  return call(member(id("assert"), method), args);
}

function errorMatcher(name, message) {
  const props = [prop("name", literal(name))];
  if (message) {
    const reMatch = message.match(/^\/(.+)\/([gimsuy]*)$/);
    props.push(prop("message", reMatch ? parseExpr(message) : literal(message)));
  }
  return obj(props);
}

function throwsOrRejects(expr, matcher, { isAwait, useRejects }) {
  if (isAwait || useRejects) {
    const fn = isAwait
      ? arrow([stmt(expr)], { async: true })
      : arrow(expr, { expression: true });
    return stmt(awaitNode(assertCall("rejects", [fn, matcher])));
  }
  return stmt(assertCall("throws", [arrow([stmt(expr)]), matcher]));
}

// --- AST query helpers ---

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

function isRequireCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "Identifier" &&
    node.callee.name === "require" &&
    node.arguments?.length >= 1 &&
    (node.arguments[0].type === "StringLiteral" || node.arguments[0].type === "Literal") &&
    typeof node.arguments[0].value === "string"
  );
}

function findRequireCalls(node) {
  const results = [];
  walkAst(node, (n) => { if (isRequireCall(n)) results.push(n); });
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

function isConsoleCall(expr) {
  return (
    expr.type === "CallExpression" &&
    expr.callee.type === "MemberExpression" &&
    expr.callee.object.type === "Identifier" &&
    expr.callee.object.name === "console"
  );
}
