import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transform } from "../src/transform.js";

// Helper: simulate generate.js assembled code with a header-slot space on line 0
function assembled(startLine, code) {
  const codeLines = code.replace(/\n$/, "").split("\n");
  const maxLine = startLine + codeLines.length - 1;
  const lines = new Array(maxLine).fill("");
  lines[0] = " ";
  for (let i = 0; i < codeLines.length; i++) {
    lines[startLine - 1 + i] = codeLines[i];
  }
  return lines.join("\n") + "\n";
}

describe("transform – import hoisting", () => {
  it("hoists ESM imports and adds assert import", () => {
    const code = assembled(3, 'import { foo } from "bar";\nfoo() //=> 42\n');
    const { code: out } = transform(code, { hoistImports: true });
    const lines = out.split("\n");
    assert.ok(lines[0].includes('import assert from "node:assert/strict"'));
    assert.ok(lines[0].includes('import { foo } from "bar"'));
  });

  it("uses CJS assert when body has require()", () => {
    const code = assembled(3, 'const x = require("foo");\nx; //=> 1\n');
    const { code: out } = transform(code, { hoistImports: true });
    assert.ok(out.startsWith('const assert = require("node:assert/strict");'));
  });

  it("uses dynamic import for plain code", () => {
    const code = assembled(3, "a; //=> 1\n");
    const { code: out } = transform(code, { hoistImports: true });
    assert.ok(out.includes('await import("node:assert/strict")'));
  });

  it("ensures semicolons on imports that lack them (ASI bug fix)", () => {
    const code = assembled(3, 'import { a } from "x"\nimport { b } from "y"\na //=> 1\n');
    const { code: out } = transform(code, { hoistImports: true });
    const header = out.split("\n")[0];
    // Both imports should have semicolons
    assert.ok(header.includes('from "x";'));
    assert.ok(header.includes('from "y";'));
    // No double semicolons
    assert.ok(!header.includes(";;"));
  });

  it("preserves line numbers after hoisting", () => {
    // Code on line 5, after hoisting the line should still be 5
    const code = assembled(5, "a; //=> 1\n");
    const { code: out } = transform(code, { hoistImports: true });
    const lines = out.split("\n");
    assert.equal(lines[4], "assert.deepEqual(a, 1);"); // line 5 = index 4
  });

  it("collapses multi-line imports to one line", () => {
    // Multi-line import that spans lines 3-5
    const lines = new Array(5).fill("");
    lines[0] = " ";
    lines[2] = "import {";
    lines[3] = "  foo,";
    lines[4] = '} from "bar";';
    // Note: This is simulating what a manually-assembled multi-line import
    // would look like. In practice, oxc-parser treats this as one ImportDeclaration.
    // We test the collapse logic through a single-string assembled block:
    const code = assembled(3, 'import {\n  foo,\n} from "bar";\nfoo //=> 42\n');
    const { code: out } = transform(code, { hoistImports: true });
    const header = out.split("\n")[0];
    assert.ok(header.includes('import { foo, } from "bar";'));
  });
});

describe("transform – import renaming", () => {
  it("renames ESM import source via resolve function", () => {
    const code = assembled(3, 'import { foo } from "my-pkg";\nfoo //=> 1\n');
    const resolve = (s) => (s === "my-pkg" ? "/abs/path/index.js" : null);
    const { code: out } = transform(code, { hoistImports: true, renameImports: resolve });
    assert.ok(out.includes('from "/abs/path/index.js"'));
    assert.ok(!out.includes('"my-pkg"'));
  });

  it("renames subpath imports", () => {
    const code = assembled(3, 'import { bar } from "my-pkg/utils";\nbar //=> 1\n');
    const resolve = (s) => (s === "my-pkg/utils" ? "/abs/path/utils.js" : null);
    const { code: out } = transform(code, { hoistImports: true, renameImports: resolve });
    assert.ok(out.includes('from "/abs/path/utils.js"'));
  });

  it("renames require() calls in body", () => {
    const code = assembled(3, 'const x = require("my-pkg");\nx //=> 1\n');
    const resolve = (s) => (s === "my-pkg" ? "/abs/path/index.js" : null);
    const { code: out } = transform(code, { hoistImports: true, renameImports: resolve });
    assert.ok(out.includes('require("/abs/path/index.js")'));
    assert.ok(!out.includes('"my-pkg"'));
  });

  it("handles $ in resolved file paths (no regex replacement bug)", () => {
    const code = assembled(3, 'import { foo } from "my-pkg";\nfoo //=> 1\n');
    const resolve = (s) => (s === "my-pkg" ? "/path/$1/index.js" : null);
    const { code: out } = transform(code, { hoistImports: true, renameImports: resolve });
    assert.ok(out.includes('"/path/$1/index.js"'));
  });

  it("preserves quote style", () => {
    const code = assembled(3, "import { foo } from 'my-pkg';\nfoo //=> 1\n");
    const resolve = (s) => (s === "my-pkg" ? "/abs/index.js" : null);
    const { code: out } = transform(code, { hoistImports: true, renameImports: resolve });
    assert.ok(out.includes("'/abs/index.js'"));
  });
});

describe("transform – assertion comments", () => {
  it("transforms //=> to assert.deepEqual", () => {
    const code = assembled(3, "1 + 1 //=> 2\n");
    const { code: out } = transform(code, { hoistImports: true });
    assert.ok(out.includes("assert.deepEqual(1 + 1, 2);"));
  });

  it("escapes double quotes in error messages (bug fix)", () => {
    const code = assembled(3, 'fn() //=> Error: expected "foo"\n');
    const { code: out } = transform(code, { hoistImports: true });
    assert.ok(out.includes('message: "expected \\"foo\\""'));
    // The generated code should be valid JS — no unescaped quotes
    assert.ok(!out.includes('message: "expected "foo""'));
  });

  it("escapes backslashes in error messages", () => {
    const code = assembled(3, "fn() //=> Error: path\\to\\file\n");
    const { code: out } = transform(code, { hoistImports: true });
    assert.ok(out.includes('message: "path\\\\to\\\\file"'));
  });
});

describe("transform – combined", () => {
  it("renames, hoists, and transforms assertions in one pass", () => {
    const code = assembled(3, 'import { add } from "my-pkg";\nadd(1, 2) //=> 3\n');
    const resolve = (s) => (s === "my-pkg" ? "/src/index.js" : null);
    const { code: out } = transform(code, {
      hoistImports: true,
      renameImports: resolve,
    });
    const header = out.split("\n")[0];
    // Header has assert + renamed import
    assert.ok(header.includes('import assert from "node:assert/strict"'));
    assert.ok(header.includes('from "/src/index.js"'));
    // Body has the assertion
    assert.ok(out.includes("assert.deepEqual(add(1, 2), 3);"));
    // Original import position is blank
    const lines = out.split("\n");
    assert.equal(lines[2], ""); // line 3 (import) is now blank
  });
});
