import assert from "node:assert/strict";
import { parseSync } from "oxc-parser";

export function parse(code) {
  return parseSync("t.js", code).program;
}

export function methodName(call) {
  return `${call.callee.object?.name}.${call.callee.property?.name}`;
}

export function assertCall(code) {
  const body = parse(code).body;
  const stmt = body.find((n) => n.type === "ExpressionStatement");
  const expr = stmt?.expression?.type === "AwaitExpression"
    ? stmt.expression.argument
    : stmt?.expression;
  assert.equal(expr?.type, "CallExpression");
  return expr;
}

export function assertAwaitedCall(code) {
  const stmt = parse(code).body.find((n) => n.type === "ExpressionStatement");
  assert.equal(stmt.expression.type, "AwaitExpression");
  const call = stmt.expression.argument;
  assert.equal(call.type, "CallExpression");
  return call;
}

export function assembled(startLine, code) {
  const codeLines = code.replace(/\n$/, "").split("\n");
  const maxLine = startLine + codeLines.length - 1;
  const lines = new Array(maxLine).fill("");
  for (let i = 0; i < codeLines.length; i++) {
    lines[startLine - 1 + i] = codeLines[i];
  }
  return lines.join("\n") + "\n";
}
