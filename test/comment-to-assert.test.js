import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { commentToAssert } from "../src/comment-to-assert.js";

describe("commentToAssert", () => {
  it("transforms //=> to assert.deepEqual", () => {
    const { code } = commentToAssert("1 + 1 //=> 2");
    assert.equal(code, "assert.deepEqual(1 + 1, 2);");
  });

  it("transforms // => with space", () => {
    const { code } = commentToAssert("x // => 42");
    assert.equal(code, "assert.deepEqual(x, 42);");
  });

  it("transforms // → with utf-8 arrow", () => {
    const { code } = commentToAssert("a // → 1");
    assert.equal(code, "assert.deepEqual(a, 1);");
  });

  it("transforms // -> with ascii arrow", () => {
    const { code } = commentToAssert("a // -> 1");
    assert.equal(code, "assert.deepEqual(a, 1);");
  });

  it("transforms // throws to assert.throws", () => {
    const { code } = commentToAssert("fn() // throws /err/");
    assert.ok(code.includes("assert.throws("));
    assert.ok(code.includes("fn();"));
    assert.ok(code.includes("/err/"));
  });

  it("handles console.log: keeps log and adds assertion", () => {
    const { code } = commentToAssert('console.log(a) //=> { a: 1 }');
    assert.ok(code.includes("console.log(a)"));
    assert.ok(code.includes("assert.deepEqual(a, { a: 1 });"));
  });

  it("console.log transform produces correct assertions", () => {
    const { code } = commentToAssert("console.log(a) //=> 1\nlet b = 2;\nb; //=> 2");
    assert.ok(code.includes("console.log(a)"));
    assert.ok(code.includes("assert.deepEqual(a, 1)"));
    assert.ok(code.includes("let b = 2;"));
    assert.ok(code.includes("assert.deepEqual(b, 2)"));
  });

  it("handles object expected values", () => {
    const { code } = commentToAssert("x //=> { a: 1, b: 2 }");
    assert.equal(code, "assert.deepEqual(x, { a: 1, b: 2 });");
  });

  it("handles array expected values", () => {
    const { code } = commentToAssert("arr //=> [1, 2, 3]");
    assert.equal(code, "assert.deepEqual(arr, [1, 2, 3]);");
  });

  it("handles await expression with //=> value", () => {
    const { code } = commentToAssert("await Promise.resolve(true) //=> true");
    assert.equal(code, "assert.deepEqual(await Promise.resolve(true), true);");
  });

  it("handles string expected values", () => {
    const { code } = commentToAssert('x //=> "hello"');
    assert.equal(code, 'assert.deepEqual(x, "hello");');
  });

  it("leaves non-assertion code untouched", () => {
    const input = "const x = 1;\nconst y = 2;";
    const { code } = commentToAssert(input);
    assert.equal(code, input);
  });

  it("handles multiple assertions", () => {
    const { code } = commentToAssert("a //=> 1\nb //=> 2");
    assert.ok(code.includes("assert.deepEqual(a, 1);"));
    assert.ok(code.includes("assert.deepEqual(b, 2);"));
  });

  it("leaves regular comments alone", () => {
    const input = "// this is a comment\nconst x = 1;";
    const { code } = commentToAssert(input);
    assert.equal(code, input);
  });

  it("handles throws with regex flags", () => {
    const { code } = commentToAssert("fn() // throws /err/i");
    assert.ok(code.includes("assert.throws("));
    assert.ok(code.includes("/err/i"));
  });

  it("transforms //=> resolves to value", () => {
    const { code } = commentToAssert("Promise.resolve(true) //=> resolves to true");
    assert.equal(code, "assert.deepEqual(await Promise.resolve(true), true);");
  });

  it("transforms //=> resolves value (without 'to')", () => {
    const { code } = commentToAssert("fetch() //=> resolves 42");
    assert.equal(code, "assert.deepEqual(await fetch(), 42);");
  });

  it("transforms // rejects", () => {
    const { code } = commentToAssert("fetch() // rejects /not found/");
    assert.ok(code.includes("assert.rejects("));
    assert.ok(code.includes("/not found/"));
  });

  it("transforms //=> rejects Error: message", () => {
    const { code } = commentToAssert("fetch() //=> rejects Error: not found");
    assert.ok(code.includes("assert.rejects("));
    assert.ok(code.includes('"Error"'));
    assert.ok(code.includes('"not found"'));
  });

  it("transforms //=> rejects TypeError: /regex/", () => {
    const { code } = commentToAssert("fetch() //=> rejects TypeError: /timeout/i");
    assert.ok(code.includes("assert.rejects("));
    assert.ok(code.includes('"TypeError"'));
    assert.ok(code.includes("/timeout/i"));
  });

  it("transforms //=> rejects RangeError without message", () => {
    const { code } = commentToAssert("fetch() //=> rejects RangeError");
    assert.ok(code.includes("assert.rejects("));
    assert.ok(code.includes('"RangeError"'));
  });

  it("transforms //=> Error: message to assert.throws", () => {
    const { code } = commentToAssert(
      "JSON.parse(bad) //=> Error: Unexpected token",
    );
    assert.ok(code.includes("assert.throws("));
    assert.ok(code.includes('"Error"'));
    assert.ok(code.includes('"Unexpected token"'));
  });

  it("transforms //=> TypeError: message to assert.throws with name", () => {
    const { code } = commentToAssert(
      "obj.name //=> TypeError: Cannot read property 'name' of undefined",
    );
    assert.ok(code.includes("assert.throws("));
    assert.ok(code.includes('"TypeError"'));
    assert.ok(code.includes("Cannot read property"));
  });

  it("transforms //=> TypeError: /regex/ to assert.throws with regex message", () => {
    const { code } = commentToAssert("fn() //=> TypeError: /bad input/");
    assert.ok(code.includes("assert.throws("));
    assert.ok(code.includes('"TypeError"'));
    assert.ok(code.includes("/bad input/"));
  });

  it("transforms //=> Error: /regex/ with flags", () => {
    const { code } = commentToAssert("fn() //=> Error: /missing \\w+/i");
    assert.ok(code.includes("assert.throws("));
    assert.ok(code.includes('"Error"'));
    assert.ok(code.includes("/i"));
  });

  it("transforms //=> RangeError without message", () => {
    const { code } = commentToAssert("fn() //=> RangeError");
    assert.ok(code.includes("assert.throws("));
    assert.ok(code.includes('"RangeError"'));
  });

  it("promotes await expr //=> Error: to async rejects", () => {
    const { code } = commentToAssert("await fetch() //=> Error: not found");
    assert.ok(code.includes("assert.rejects("));
    assert.ok(code.includes("async () =>"));
    assert.ok(code.includes('"not found"'));
  });

  it("promotes await expr // throws to async rejects", () => {
    const { code } = commentToAssert("await fn() // throws /err/");
    assert.ok(code.includes("assert.rejects("));
    assert.ok(code.includes("async () =>"));
    assert.ok(code.includes("/err/"));
  });

  it("wraps await expr // rejects in async callback", () => {
    const { code } = commentToAssert("await fetch() // rejects /err/");
    assert.ok(code.includes("assert.rejects("));
    assert.ok(code.includes("async () =>"));
  });

  it("wraps await expr //=> rejects Error: in async callback", () => {
    const { code } = commentToAssert("await fetch() //=> rejects TypeError: timeout");
    assert.ok(code.includes("assert.rejects("));
    assert.ok(code.includes("async () =>"));
    assert.ok(code.includes('"TypeError"'));
    assert.ok(code.includes('"timeout"'));
  });

  it("escapes double quotes in error message strings", () => {
    const { code } = commentToAssert('fn() //=> Error: expected "foo"');
    assert.ok(code.includes("assert.throws("));
    assert.ok(code.includes('"expected \\"foo\\""'));
  });
});
