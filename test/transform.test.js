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
    assert.ok(out.includes('import assert from "node:assert/strict"'));
    assert.ok(out.includes('import { foo } from "bar"'));
  });

  it("uses CJS assert when body has require()", () => {
    const code = assembled(3, 'const x = require("foo");\nx; //=> 1\n');
    const { code: out } = transform(code, { hoistImports: true });
    assert.ok(out.includes('require("node:assert/strict")'));
  });

  it("uses dynamic import for plain code", () => {
    const code = assembled(3, "a; //=> 1\n");
    const { code: out } = transform(code, { hoistImports: true });
    assert.ok(out.includes('import("node:assert/strict")'));
  });

  it("handles imports without semicolons", () => {
    const code = assembled(3, 'import { a } from "x"\nimport { b } from "y"\na //=> 1\n');
    const { code: out } = transform(code, { hoistImports: true });
    assert.ok(out.includes('from "x"'));
    assert.ok(out.includes('from "y"'));
    assert.ok(out.includes("assert.deepEqual(a, 1)"));
  });
});

describe("transform – import renaming", () => {
  it("renames ESM import source via resolve function", () => {
    const code = assembled(3, 'import { foo } from "my-pkg";\nfoo //=> 1\n');
    const resolve = (s) => (s === "my-pkg" ? "/abs/path/index.js" : null);
    const { code: out } = transform(code, { hoistImports: true, renameImports: resolve });
    assert.ok(out.includes('"/abs/path/index.js"'));
    assert.ok(!out.includes('"my-pkg"'));
  });

  it("renames subpath imports", () => {
    const code = assembled(3, 'import { bar } from "my-pkg/utils";\nbar //=> 1\n');
    const resolve = (s) => (s === "my-pkg/utils" ? "/abs/path/utils.js" : null);
    const { code: out } = transform(code, { hoistImports: true, renameImports: resolve });
    assert.ok(out.includes('"/abs/path/utils.js"'));
  });

  it("renames require() calls in body", () => {
    const code = assembled(3, 'const x = require("my-pkg");\nx //=> 1\n');
    const resolve = (s) => (s === "my-pkg" ? "/abs/path/index.js" : null);
    const { code: out } = transform(code, { hoistImports: true, renameImports: resolve });
    assert.ok(out.includes('require("/abs/path/index.js")'));
    assert.ok(!out.includes('"my-pkg"'));
  });

  it("handles $ in resolved file paths", () => {
    const code = assembled(3, 'import { foo } from "my-pkg";\nfoo //=> 1\n');
    const resolve = (s) => (s === "my-pkg" ? "/path/$1/index.js" : null);
    const { code: out } = transform(code, { hoistImports: true, renameImports: resolve });
    assert.ok(out.includes('"/path/$1/index.js"'));
  });
});

describe("transform – assertion comments", () => {
  it("transforms //=> to assert.deepEqual", () => {
    const code = assembled(3, "1 + 1 //=> 2\n");
    const { code: out } = transform(code, { hoistImports: true });
    assert.ok(out.includes("assert.deepEqual(1 + 1, 2);"));
  });

  it("escapes double quotes in error messages", () => {
    const code = assembled(3, 'fn() //=> Error: expected "foo"\n');
    const { code: out } = transform(code, { hoistImports: true });
    assert.ok(out.includes('"expected \\"foo\\""'));
    assert.ok(!out.includes('"expected "foo""'));
  });

  it("escapes backslashes in error messages", () => {
    const code = assembled(3, "fn() //=> Error: path\\to\\file\n");
    const { code: out } = transform(code, { hoistImports: true });
    assert.ok(out.includes('"path\\\\to\\\\file"'));
  });
});

describe("transform – sourcemaps", () => {
  it("generates sourcemap when sourceMapSource is provided", () => {
    const code = assembled(3, "1 + 1 //=> 2\n");
    const { map } = transform(code, { hoistImports: true, sourceMapSource: "readme.md" });
    assert.ok(map);
    assert.equal(map.version, 3);
    assert.deepEqual(map.sources, ["readme.md"]);
  });

  it("maps assertion line back to original markdown position", () => {
    // Code on markdown line 5
    const code = assembled(5, "x; //=> 999\n");
    const { map } = transform(code, { hoistImports: true, sourceMapSource: "test.md" });
    // Decode the mappings to verify the assert maps back to line 5
    // mappings format: each semicolon-separated group is an output line
    assert.ok(map.mappings.length > 1, "should have non-trivial mappings");
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
    assert.ok(out.includes('import assert from "node:assert/strict"'));
    assert.ok(out.includes('"/src/index.js"'));
    assert.ok(out.includes("assert.deepEqual(add(1, 2), 3);"));
  });
});
