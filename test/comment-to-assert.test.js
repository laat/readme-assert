import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSync } from "oxc-parser";
import { commentToAssert } from "../src/comment-to-assert.js";

function parse(code) {
  return parseSync("t.js", code).program;
}

function assertCall(code) {
  const body = parse(code).body;
  const stmt = body.find((n) => n.type === "ExpressionStatement");
  const expr = stmt?.expression?.type === "AwaitExpression"
    ? stmt.expression.argument
    : stmt?.expression;
  assert.equal(expr?.type, "CallExpression");
  return expr;
}

function methodName(call) {
  return `${call.callee.object?.name}.${call.callee.property?.name}`;
}

describe("commentToAssert", () => {
  it("transforms //=> to assert.deepEqual", () => {
    const call = assertCall(commentToAssert("1 + 1 //=> 2").code);
    assert.equal(methodName(call), "assert.deepEqual");
    assert.equal(call.arguments.length, 2);
  });

  it("transforms // => with space", () => {
    const call = assertCall(commentToAssert("x // => 42").code);
    assert.equal(methodName(call), "assert.deepEqual");
  });

  it("transforms // → with utf-8 arrow", () => {
    const call = assertCall(commentToAssert("a // → 1").code);
    assert.equal(methodName(call), "assert.deepEqual");
  });

  it("transforms // -> with ascii arrow", () => {
    const call = assertCall(commentToAssert("a // -> 1").code);
    assert.equal(methodName(call), "assert.deepEqual");
  });

  it("transforms // throws to assert.throws", () => {
    const call = assertCall(commentToAssert("fn() // throws /err/").code);
    assert.equal(methodName(call), "assert.throws");
    assert.equal(call.arguments[0].type, "ArrowFunctionExpression");
    assert.equal(call.arguments[1].type, "Literal");
  });

  it("handles console.log: keeps log and adds assertion", () => {
    const body = parse(commentToAssert('console.log(a) //=> { a: 1 }').code).body;
    const calls = body
      .filter((n) => n.type === "ExpressionStatement")
      .map((n) => n.expression);
    assert.ok(calls.some((c) => c.callee?.object?.name === "console"));
    assert.ok(calls.some((c) => methodName(c) === "assert.deepEqual"));
  });

  it("console.log transform produces correct assertions", () => {
    const body = parse(commentToAssert("console.log(a) //=> 1\nlet b = 2;\nb; //=> 2").code).body;
    const calls = body
      .filter((n) => n.type === "ExpressionStatement")
      .map((n) => n.expression)
      .filter((e) => e.type === "CallExpression");
    const methods = calls.map(methodName);
    assert.ok(methods.includes("assert.deepEqual"));
    assert.ok(methods.includes("console.log"));
  });

  it("handles object expected values", () => {
    const call = assertCall(commentToAssert("x //=> { a: 1, b: 2 }").code);
    assert.equal(methodName(call), "assert.deepEqual");
    assert.equal(call.arguments[1].type, "ObjectExpression");
  });

  it("handles array expected values", () => {
    const call = assertCall(commentToAssert("arr //=> [1, 2, 3]").code);
    assert.equal(methodName(call), "assert.deepEqual");
    assert.equal(call.arguments[1].type, "ArrayExpression");
  });

  it("handles await expression with //=> value", () => {
    const call = assertCall(commentToAssert("await Promise.resolve(true) //=> true").code);
    assert.equal(methodName(call), "assert.deepEqual");
    // First arg should be an await expression
    assert.equal(call.arguments[0].type, "AwaitExpression");
  });

  it("handles string expected values", () => {
    const call = assertCall(commentToAssert('x //=> "hello"').code);
    assert.equal(call.arguments[1].value, "hello");
  });

  it("leaves non-assertion code untouched", () => {
    const input = "const x = 1;\nconst y = 2;";
    const { code } = commentToAssert(input);
    assert.equal(code, input);
  });

  it("handles multiple assertions", () => {
    const body = parse(commentToAssert("a //=> 1\nb //=> 2").code).body;
    const calls = body
      .filter((n) => n.type === "ExpressionStatement")
      .map((n) => n.expression);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => methodName(c) === "assert.deepEqual"));
  });

  it("leaves regular comments alone", () => {
    const input = "// this is a comment\nconst x = 1;";
    const { code } = commentToAssert(input);
    assert.equal(code, input);
  });

  it("handles throws with regex flags", () => {
    const call = assertCall(commentToAssert("fn() // throws /err/i").code);
    assert.equal(methodName(call), "assert.throws");
    assert.match(call.arguments[1].raw, /\/err\/i/);
  });

  it("transforms //=> resolves to value", () => {
    const call = assertCall(commentToAssert("Promise.resolve(true) //=> resolves to true").code);
    assert.equal(methodName(call), "assert.deepEqual");
    assert.equal(call.arguments[0].type, "AwaitExpression");
  });

  it("transforms //=> resolves value (without 'to')", () => {
    const call = assertCall(commentToAssert("fetch() //=> resolves 42").code);
    assert.equal(methodName(call), "assert.deepEqual");
    assert.equal(call.arguments[0].type, "AwaitExpression");
  });

  it("transforms // rejects", () => {
    const { code } = commentToAssert("fetch() // rejects /not found/");
    const stmt = parse(code).body[0];
    const call = stmt.expression.type === "AwaitExpression"
      ? stmt.expression.argument
      : stmt.expression;
    assert.equal(methodName(call), "assert.rejects");
    assert.equal(call.arguments[1].type, "Literal");
  });

  it("transforms //=> rejects Error: message", () => {
    const { code } = commentToAssert("fetch() //=> rejects Error: not found");
    const call = assertCall(code);
    assert.equal(methodName(call), "assert.rejects");
    const matcher = call.arguments[1];
    assert.equal(matcher.type, "ObjectExpression");
  });

  it("transforms //=> rejects TypeError: /regex/", () => {
    const call = assertCall(
      commentToAssert("fetch() //=> rejects TypeError: /timeout/i").code,
    );
    assert.equal(methodName(call), "assert.rejects");
  });

  it("transforms //=> rejects RangeError without message", () => {
    const call = assertCall(
      commentToAssert("fetch() //=> rejects RangeError").code,
    );
    assert.equal(methodName(call), "assert.rejects");
  });

  it("transforms //=> Error: message to assert.throws", () => {
    const call = assertCall(
      commentToAssert("JSON.parse(bad) //=> Error: Unexpected token").code,
    );
    assert.equal(methodName(call), "assert.throws");
    const matcher = call.arguments[1];
    assert.equal(matcher.type, "ObjectExpression");
  });

  it("transforms //=> TypeError: message to assert.throws with name", () => {
    const call = assertCall(
      commentToAssert(
        "obj.name //=> TypeError: Cannot read property 'name' of undefined",
      ).code,
    );
    assert.equal(methodName(call), "assert.throws");
  });

  it("transforms //=> TypeError: /regex/ to assert.throws with regex message", () => {
    const call = assertCall(
      commentToAssert("fn() //=> TypeError: /bad input/").code,
    );
    assert.equal(methodName(call), "assert.throws");
  });

  it("transforms //=> Error: /regex/ with flags", () => {
    const call = assertCall(
      commentToAssert("fn() //=> Error: /missing \\w+/i").code,
    );
    assert.equal(methodName(call), "assert.throws");
  });

  it("transforms //=> RangeError without message", () => {
    const call = assertCall(commentToAssert("fn() //=> RangeError").code);
    assert.equal(methodName(call), "assert.throws");
  });

  it("promotes await expr //=> Error: to async rejects", () => {
    const stmt = parse(
      commentToAssert("await fetch() //=> Error: not found").code,
    ).body[0];
    assert.equal(stmt.expression.type, "AwaitExpression");
    const call = stmt.expression.argument;
    assert.equal(methodName(call), "assert.rejects");
    assert.equal(call.arguments[0].async, true);
  });

  it("promotes await expr // throws to async rejects", () => {
    const stmt = parse(
      commentToAssert("await fn() // throws /err/").code,
    ).body[0];
    assert.equal(stmt.expression.type, "AwaitExpression");
    assert.equal(methodName(stmt.expression.argument), "assert.rejects");
  });

  it("wraps await expr // rejects in async callback", () => {
    const stmt = parse(
      commentToAssert("await fetch() // rejects /err/").code,
    ).body[0];
    assert.equal(stmt.expression.type, "AwaitExpression");
    assert.equal(methodName(stmt.expression.argument), "assert.rejects");
  });

  it("wraps await expr //=> rejects Error: in async callback", () => {
    const stmt = parse(
      commentToAssert("await fetch() //=> rejects TypeError: timeout").code,
    ).body[0];
    assert.equal(stmt.expression.type, "AwaitExpression");
    const call = stmt.expression.argument;
    assert.equal(methodName(call), "assert.rejects");
    assert.equal(call.arguments[0].async, true);
  });

  it("escapes double quotes in error message strings", () => {
    const call = assertCall(
      commentToAssert('fn() //=> Error: expected "foo"').code,
    );
    assert.equal(methodName(call), "assert.throws");
    const matcher = call.arguments[1];
    const msgProp = matcher.properties.find(
      (p) => p.key.name === "message" || p.key.value === "message",
    );
    assert.ok(msgProp);
    assert.ok(msgProp.value.value.includes('"foo"'));
  });
});
