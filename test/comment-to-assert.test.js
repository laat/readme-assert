import { describe, it, expect } from "vitest";
import { commentToAssert } from "../src/comment-to-assert.js";

describe("commentToAssert", () => {
  it("transforms //=> to assert.deepEqual", () => {
    const { code } = commentToAssert("1 + 1 //=> 2");
    expect(code).toBe("assert.deepEqual(1 + 1, 2);");
  });

  it("transforms // => with space", () => {
    const { code } = commentToAssert("x // => 42");
    expect(code).toBe("assert.deepEqual(x, 42);");
  });

  it("transforms // → with utf-8 arrow", () => {
    const { code } = commentToAssert("a // → 1");
    expect(code).toBe("assert.deepEqual(a, 1);");
  });

  it("transforms // -> with ascii arrow", () => {
    const { code } = commentToAssert("a // -> 1");
    expect(code).toBe("assert.deepEqual(a, 1);");
  });

  it("transforms // throws to assert.throws", () => {
    const { code } = commentToAssert("fn() // throws /err/");
    expect(code).toBe("assert.throws(() => { fn(); }, /err/);");
  });

  it("handles console.log: keeps log and adds assertion", () => {
    const { code } = commentToAssert('console.log(a) //=> { a: 1 }');
    expect(code).toContain("console.log(a)");
    expect(code).toContain("assert.deepEqual(a, { a: 1 });");
  });

  it("handles object expected values", () => {
    const { code } = commentToAssert("x //=> { a: 1, b: 2 }");
    expect(code).toBe("assert.deepEqual(x, { a: 1, b: 2 });");
  });

  it("handles array expected values", () => {
    const { code } = commentToAssert("arr //=> [1, 2, 3]");
    expect(code).toBe("assert.deepEqual(arr, [1, 2, 3]);");
  });

  it("handles string expected values", () => {
    const { code } = commentToAssert('x //=> "hello"');
    expect(code).toBe('assert.deepEqual(x, "hello");');
  });

  it("leaves non-assertion code untouched", () => {
    const input = "const x = 1;\nconst y = 2;";
    const { code } = commentToAssert(input);
    expect(code).toBe(input);
  });

  it("handles multiple assertions", () => {
    const input = "a //=> 1\nb //=> 2";
    const { code } = commentToAssert(input);
    expect(code).toContain("assert.deepEqual(a, 1);");
    expect(code).toContain("assert.deepEqual(b, 2);");
  });

  it("leaves regular comments alone", () => {
    const input = "// this is a comment\nconst x = 1;";
    const { code } = commentToAssert(input);
    expect(code).toBe(input);
  });

  it("returns null map when no changes", () => {
    const { map } = commentToAssert("const x = 1;");
    expect(map).toBeNull();
  });

  it("returns a source map when changes are made", () => {
    const { map } = commentToAssert("x //=> 1");
    expect(map).not.toBeNull();
  });

  it("handles throws with regex flags", () => {
    const { code } = commentToAssert("fn() // throws /err/i");
    expect(code).toBe("assert.throws(() => { fn(); }, /err/i);");
  });

  it("transforms //=> resolves to value", () => {
    const { code } = commentToAssert("Promise.resolve(true) //=> resolves to true");
    expect(code).toBe("assert.deepEqual(await Promise.resolve(true), true);");
  });

  it("transforms //=> resolves value (without 'to')", () => {
    const { code } = commentToAssert("fetch() //=> resolves 42");
    expect(code).toBe("assert.deepEqual(await fetch(), 42);");
  });

  it("transforms // rejects", () => {
    const { code } = commentToAssert("fetch() // rejects /not found/");
    expect(code).toBe("await assert.rejects(() => fetch(), /not found/);");
  });
});
