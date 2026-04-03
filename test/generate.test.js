import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../src/generate.js";

describe("generate", () => {
  it("produces one unit per ungrouped block", () => {
    const { units } = generate({
      blocks: [
        { code: "a; //=> 1\n", lang: "javascript", tag: "test", group: null, startLine: 3, endLine: 3 },
        { code: "b; //=> 2\n", lang: "javascript", tag: "test", group: null, startLine: 7, endLine: 7 },
      ],
      hasTypescript: false,
    });
    assert.equal(units.length, 2);
    assert.ok(units[0].code.includes("a; //=> 1"));
    assert.ok(!units[0].code.includes("b; //=> 2"));
    assert.ok(units[1].code.includes("b; //=> 2"));
  });

  it("merges blocks with the same group", () => {
    const { units } = generate({
      blocks: [
        { code: "let x = 1;\n", lang: "javascript", tag: "test:math", group: "math", startLine: 3, endLine: 3 },
        { code: "x; //=> 1\n", lang: "javascript", tag: "test:math", group: "math", startLine: 7, endLine: 7 },
      ],
      hasTypescript: false,
    });
    assert.equal(units.length, 1);
    assert.ok(units[0].code.includes("let x = 1;"));
    assert.ok(units[0].code.includes("x; //=> 1"));
    assert.equal(units[0].name, "math");
  });

  it("keeps grouped and ungrouped blocks separate", () => {
    const { units } = generate({
      blocks: [
        { code: "a; //=> 1\n", lang: "javascript", tag: "test", group: null, startLine: 3, endLine: 3 },
        { code: "let x = 1;\n", lang: "javascript", tag: "test:g1", group: "g1", startLine: 7, endLine: 7 },
        { code: "x; //=> 1\n", lang: "javascript", tag: "test:g1", group: "g1", startLine: 11, endLine: 11 },
      ],
      hasTypescript: false,
    });
    assert.equal(units.length, 2);
    assert.ok(units[0].code.includes("a; //=> 1"));
    assert.ok(units[1].code.includes("let x = 1;"));
    assert.ok(units[1].code.includes("x; //=> 1"));
  });

  it("uses dynamic import for plain code (no ESM/CJS syntax)", () => {
    const { units } = generate({
      blocks: [
        { code: "a; //=> 1\n", lang: "javascript", tag: "test", group: null, startLine: 3, endLine: 3 },
      ],
      hasTypescript: false,
    });
    assert.ok(units[0].code.includes('await import("node:assert/strict")'));
  });

  it("uses CJS assert when user code has require()", () => {
    const { units } = generate({
      blocks: [
        { code: 'const x = require("foo");\nx; //=> 1\n', lang: "javascript", tag: "test", group: null, startLine: 3, endLine: 4 },
      ],
      hasTypescript: false,
    });
    assert.ok(units[0].code.includes('const assert = require("node:assert/strict");'));
  });

  it("uses ESM assert when user code has imports", () => {
    const { units } = generate({
      blocks: [
        {
          code: 'import { foo } from "bar";\nfoo() //=> 42\n',
          lang: "javascript",
          tag: "test",
          group: null,
          startLine: 3,
          endLine: 4,
        },
      ],
      hasTypescript: false,
    });
    assert.ok(units[0].code.includes('import assert from "node:assert/strict";'));
  });

  it("hoists imports to top of unit", () => {
    const { units } = generate({
      blocks: [
        {
          code: 'import { foo } from "bar";\nfoo() //=> 42\n',
          lang: "javascript",
          tag: "test",
          group: null,
          startLine: 3,
          endLine: 4,
        },
      ],
      hasTypescript: false,
    });
    const lines = units[0].code.split("\n");
    const importLine = lines.findIndex((l) => l.includes('from "bar"'));
    const bodyLine = lines.findIndex((l) => l.includes("foo()"));
    assert.ok(importLine < bodyLine);
  });

  it("returns empty units for no blocks", () => {
    const { units } = generate({ blocks: [], hasTypescript: false });
    assert.equal(units.length, 0);
  });

  it("tracks typescript per unit", () => {
    const { units } = generate({
      blocks: [
        { code: "a; //=> 1\n", lang: "javascript", tag: "test", group: null, startLine: 3, endLine: 3 },
        { code: "const x: number = 1;\n", lang: "typescript", tag: "test", group: null, startLine: 7, endLine: 7 },
      ],
      hasTypescript: true,
    });
    assert.equal(units[0].hasTypescript, false);
    assert.equal(units[1].hasTypescript, true);
  });
});
