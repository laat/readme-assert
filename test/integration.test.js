import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { processMarkdown, resolveMainEntry, run } from "../src/run.js";

const fixturesDir = new URL("./fixtures/", import.meta.url).pathname;

describe("processMarkdown", () => {
  it("transforms simple.md into separate units", async () => {
    const units = await processMarkdown(path.join(fixturesDir, "simple.md"));
    assert.ok(units.length >= 1);
    const allCode = units.map((u) => u.code).join("\n");
    assert.ok(allCode.includes("assert.deepEqual(a, 1);"));
    assert.ok(allCode.includes("assert.deepEqual(b, 2);"));
  });

  it("transforms throws.md", async () => {
    const units = await processMarkdown(path.join(fixturesDir, "throws.md"));
    assert.ok(units.length >= 1);
    assert.ok(units[0].code.includes("assert.throws("));
  });

  it("rewrites imports when package.json exports is a string", async () => {
    const readme = path.join(fixturesDir, "pkg-string-exports/readme.md");
    const expected = path.join(fixturesDir, "pkg-string-exports/lib/main.js");
    const units = await processMarkdown(readme);
    const code = units.map((u) => u.code).join("\n");
    assert.ok(
      code.includes(expected),
      `expected import rewritten to ${expected}, got:\n${code}`,
    );
    assert.ok(!code.includes('"@fixture/string-exports"'));
  });
});

describe("run", () => {
  it("executes simple.md successfully", async () => {
    const result = await run(path.join(fixturesDir, "simple.md"));
    assert.equal(result.exitCode, 0);
  });

  it("executes throws.md successfully", async () => {
    const result = await run(path.join(fixturesDir, "throws.md"));
    assert.equal(result.exitCode, 0);
  });

  it("executes a package with exports as string", async () => {
    const result = await run(
      path.join(fixturesDir, "pkg-string-exports/readme.md"),
    );
    assert.equal(result.exitCode, 0, result.stderr);
  });

  it("reports the correct line when a block contains a console.log assertion", async () => {
    // The failing expression `b; //=> 3` is on line 6 of console-shift.md.
    // Regression: the console.log transform used to insert a newline which
    // shifted later lines, pointing the error at the closing fence.
    const result = await run(path.join(fixturesDir, "console-shift.md"));
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /console-shift\.md:6/);
  });
});

describe("resolveMainEntry", () => {
  it("returns pkg.main when set", () => {
    assert.equal(resolveMainEntry({ main: "./foo.js" }), "./foo.js");
  });

  it("pkg.main takes precedence over exports", () => {
    assert.equal(
      resolveMainEntry({ main: "./foo.js", exports: "./bar.js" }),
      "./foo.js",
    );
  });

  it("returns exports when it is a string", () => {
    assert.equal(
      resolveMainEntry({ exports: "./lib/main.js" }),
      "./lib/main.js",
    );
  });

  it("returns exports['.'] when it is a subpath map", () => {
    assert.equal(
      resolveMainEntry({
        exports: { ".": "./lib/main.js", "./sub": "./sub.js" },
      }),
      "./lib/main.js",
    );
  });

  it("resolves conditional exports at a subpath", () => {
    assert.equal(
      resolveMainEntry({
        exports: { ".": { import: "./esm.js", require: "./cjs.js" } },
      }),
      "./esm.js",
    );
  });

  it("resolves bare conditional exports (no subpaths)", () => {
    assert.equal(
      resolveMainEntry({
        exports: { import: "./esm.js", require: "./cjs.js" },
      }),
      "./esm.js",
    );
  });

  it("prefers import > default > require", () => {
    assert.equal(
      resolveMainEntry({
        exports: { require: "./cjs.js", default: "./default.js" },
      }),
      "./default.js",
    );
    assert.equal(
      resolveMainEntry({ exports: { require: "./cjs.js" } }),
      "./cjs.js",
    );
  });

  it("resolves nested conditions", () => {
    assert.equal(
      resolveMainEntry({
        exports: {
          ".": {
            import: { types: "./types.d.ts", default: "./esm.js" },
          },
        },
      }),
      "./esm.js",
    );
  });

  it("returns null when no entry can be determined", () => {
    assert.equal(resolveMainEntry({}), null);
    assert.equal(resolveMainEntry({ exports: null }), null);
  });
});
