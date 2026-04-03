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
    assert.equal(code, "assert.throws(() => { fn(); }, /err/);");
  });

  it("handles console.log: keeps log and adds assertion", () => {
    const { code } = commentToAssert('console.log(a) //=> { a: 1 }');
    assert.ok(code.includes("console.log(a)"));
    assert.ok(code.includes("assert.deepEqual(a, { a: 1 });"));
  });

  it("handles object expected values", () => {
    const { code } = commentToAssert("x //=> { a: 1, b: 2 }");
    assert.equal(code, "assert.deepEqual(x, { a: 1, b: 2 });");
  });

  it("handles array expected values", () => {
    const { code } = commentToAssert("arr //=> [1, 2, 3]");
    assert.equal(code, "assert.deepEqual(arr, [1, 2, 3]);");
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
    const input = "a //=> 1\nb //=> 2";
    const { code } = commentToAssert(input);
    assert.ok(code.includes("assert.deepEqual(a, 1);"));
    assert.ok(code.includes("assert.deepEqual(b, 2);"));
  });

  it("leaves regular comments alone", () => {
    const input = "// this is a comment\nconst x = 1;";
    const { code } = commentToAssert(input);
    assert.equal(code, input);
  });

  it("returns null map when no changes", () => {
    const { map } = commentToAssert("const x = 1;");
    assert.equal(map, null);
  });

  it("returns a source map when changes are made", () => {
    const { map } = commentToAssert("x //=> 1");
    assert.notEqual(map, null);
  });

  it("handles throws with regex flags", () => {
    const { code } = commentToAssert("fn() // throws /err/i");
    assert.equal(code, "assert.throws(() => { fn(); }, /err/i);");
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
    assert.equal(code, "await assert.rejects(() => fetch(), /not found/);");
  });
});
