import { visitorKeys } from "oxc-parser";

export const assertCommentRe = /\/\/\s*(=>|→|->|throws|rejects)/;

export function walkAst(node, visitor) {
  if (!node || typeof node !== "object") return;
  if (node.type) {
    visitor(node);
    const keys = visitorKeys[node.type];
    if (keys) {
      for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
          for (const item of child) walkAst(item, visitor);
        } else {
          walkAst(child, visitor);
        }
      }
    }
    return;
  }
  // Fallback for untyped containers (e.g. { body: [...] })
  for (const key of Object.keys(node)) {
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) walkAst(item, visitor);
    }
  }
}

export function isDeclaration(node) {
  return (
    node.type === "ImportDeclaration" ||
    node.type === "ExportNamedDeclaration" ||
    node.type === "ExportDefaultDeclaration" ||
    node.type === "ExportAllDeclaration"
  );
}

export function getSourceNode(node) {
  if (node.type === "ImportDeclaration") return node.source;
  if (node.type === "ExportNamedDeclaration" && node.source) return node.source;
  if (node.type === "ExportAllDeclaration") return node.source;
  return null;
}

export function isRequireCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "Identifier" &&
    node.callee.name === "require" &&
    node.arguments?.length >= 1 &&
    (node.arguments[0].type === "StringLiteral" || node.arguments[0].type === "Literal") &&
    typeof node.arguments[0].value === "string"
  );
}

export function findRequireCalls(node) {
  const results = [];
  walkAst(node, (n) => { if (isRequireCall(n)) results.push(n); });
  return results;
}

export function isConsoleCall(expr) {
  return (
    expr.type === "CallExpression" &&
    expr.callee?.type === "MemberExpression" &&
    expr.callee.object?.type === "Identifier" &&
    expr.callee.object.name === "console"
  );
}

export function findTrailingComment(comments, node, code) {
  for (const c of comments) {
    if (c.type !== "Line") continue;
    if (c.start < node.expression.end) continue;
    const between = code.slice(node.expression.end, c.start);
    if (between.includes("\n")) continue;
    return c;
  }
  return null;
}

// --- Location utilities ---

export function buildLineIndex(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

export function offsetToLoc(lineStarts, offset) {
  let lo = 0, hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineStarts[lo] };
}

export function addLoc(ast, source) {
  const lineStarts = buildLineIndex(source);
  walkAst(ast, (node) => {
    if ("start" in node && "end" in node) {
      node.loc = {
        start: offsetToLoc(lineStarts, node.start),
        end: offsetToLoc(lineStarts, node.end),
      };
    }
  });
}

export function stampLoc(node, loc) {
  walkAst(node, (n) => { n.loc = loc; });
}
