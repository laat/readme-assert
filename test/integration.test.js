import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { processMarkdown, resolveMainEntry, run } from "../src/run.js";

const repoRoot = new URL("../", import.meta.url).pathname;

const cliPath = new URL("../src/cli.js", import.meta.url).pathname;

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

  it("throws NO_TEST_BLOCKS when the readme has no test blocks", async () => {
    await assert.rejects(
      () => processMarkdown(path.join(fixturesDir, "no-blocks.md")),
      (err) => {
        assert.equal(err.code, "NO_TEST_BLOCKS");
        assert.match(err.message, /no-blocks\.md/);
        return true;
      },
    );
  });

  it("strips TypeScript types via esbuild for ts blocks", async () => {
    const units = await processMarkdown(path.join(fixturesDir, "typescript.md"));
    assert.equal(units.length, 1);
    const code = units[0].code;
    // esbuild should have removed the TS type annotations
    assert.ok(!code.includes(": number"), `expected no ": number" in:\n${code}`);
    assert.ok(!code.includes(": string"), `expected no ": string" in:\n${code}`);
    // The assert calls should still be there
    assert.ok(code.includes("assert.deepEqual(a, 2);"));
    assert.ok(code.includes('assert.deepEqual(label, "two");'));
  });
});

describe("cli", () => {
  it("exits cleanly when the readme has no test blocks", () => {
    const result = spawnSync(
      "node",
      [cliPath, "-f", path.join(fixturesDir, "no-blocks.md")],
      { encoding: "utf-8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No test code blocks found/);
    // Regression: no raw stack trace or node error banner should leak.
    assert.doesNotMatch(result.stderr, /at processMarkdown/);
    assert.doesNotMatch(result.stderr, /\bNode\.js v/);
  });

  it("rejects unknown flags with a friendly message", () => {
    const result = spawnSync("node", [cliPath, "--autop"], {
      encoding: "utf-8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /autop/);
    assert.match(result.stderr, /--help/);
    // No raw stack trace should leak from parseArgs
    assert.doesNotMatch(result.stderr, /at parseArgs/);
  });
});

describe("skill docs", () => {
  it("keeps docs/skill.md in sync with .claude/skills/readme-test.md", () => {
    const skill = fs.readFileSync(
      path.join(repoRoot, ".claude/skills/readme-test.md"),
      "utf-8",
    );
    const docs = fs.readFileSync(
      path.join(repoRoot, "docs/skill.md"),
      "utf-8",
    );
    // The docs page wraps the skill in a ```` markdown fence; extract it
    // and verify byte-for-byte equality with the source-of-truth skill.
    const match = docs.match(/^````markdown\n([\s\S]+?)\n````$/m);
    assert.ok(
      match,
      "expected docs/skill.md to contain a ```` markdown fence",
    );
    assert.equal(
      match[1],
      skill.replace(/\n$/, ""),
      "docs/skill.md code block is out of sync with .claude/skills/readme-test.md",
    );
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

  it("executes a TypeScript block end-to-end", async () => {
    const result = await run(path.join(fixturesDir, "typescript.md"));
    assert.equal(result.exitCode, 0, result.stderr);
  });

  it("downgrades plain blocks to CJS so --require hooks apply", async () => {
    // Plain code (no import/export/require) + --require should produce a
    // .cjs tmp file so the setup script's globals are visible to the block.
    const readme = path.join(fixturesDir, "require-downgrade/readme.md");
    const setup = path.join(fixturesDir, "require-downgrade/setup.cjs");
    const result = await run(readme, { require: [setup] });
    assert.equal(result.exitCode, 0, result.stderr);
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
