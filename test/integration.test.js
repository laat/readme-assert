import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { processMarkdown, run } from "../src/run.js";

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
});
