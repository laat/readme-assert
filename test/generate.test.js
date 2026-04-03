import { describe, it, expect } from "vitest";
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
    expect(units).toHaveLength(2);
    expect(units[0].code).toContain("a; //=> 1");
    expect(units[0].code).not.toContain("b; //=> 2");
    expect(units[1].code).toContain("b; //=> 2");
  });

  it("merges blocks with the same group", () => {
    const { units } = generate({
      blocks: [
        { code: "let x = 1;\n", lang: "javascript", tag: "test:math", group: "math", startLine: 3, endLine: 3 },
        { code: "x; //=> 1\n", lang: "javascript", tag: "test:math", group: "math", startLine: 7, endLine: 7 },
      ],
      hasTypescript: false,
    });
    expect(units).toHaveLength(1);
    expect(units[0].code).toContain("let x = 1;");
    expect(units[0].code).toContain("x; //=> 1");
    expect(units[0].name).toBe("math");
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
    expect(units).toHaveLength(2);
    expect(units[0].code).toContain("a; //=> 1");
    expect(units[1].code).toContain("let x = 1;");
    expect(units[1].code).toContain("x; //=> 1");
  });

  it("uses dynamic import for plain code (no ESM/CJS syntax)", () => {
    const { units } = generate({
      blocks: [
        { code: "a; //=> 1\n", lang: "javascript", tag: "test", group: null, startLine: 3, endLine: 3 },
      ],
      hasTypescript: false,
    });
    expect(units[0].code).toContain('await import("node:assert/strict")');
  });

  it("uses CJS assert when user code has require()", () => {
    const { units } = generate({
      blocks: [
        { code: 'const x = require("foo");\nx; //=> 1\n', lang: "javascript", tag: "test", group: null, startLine: 3, endLine: 4 },
      ],
      hasTypescript: false,
    });
    expect(units[0].code).toContain('const assert = require("node:assert/strict");');
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
    expect(units[0].code).toContain('import assert from "node:assert/strict";');
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
    expect(importLine).toBeLessThan(bodyLine);
  });

  it("returns empty units for no blocks", () => {
    const { units } = generate({ blocks: [], hasTypescript: false });
    expect(units).toHaveLength(0);
  });

  it("tracks typescript per unit", () => {
    const { units } = generate({
      blocks: [
        { code: "a; //=> 1\n", lang: "javascript", tag: "test", group: null, startLine: 3, endLine: 3 },
        { code: "const x: number = 1;\n", lang: "typescript", tag: "test", group: null, startLine: 7, endLine: 7 },
      ],
      hasTypescript: true,
    });
    expect(units[0].hasTypescript).toBe(false);
    expect(units[1].hasTypescript).toBe(true);
  });
});
