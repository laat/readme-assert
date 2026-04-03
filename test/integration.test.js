import { describe, it, expect } from "vitest";
import path from "node:path";
import { processMarkdown, run } from "../src/run.js";

const fixturesDir = new URL("./fixtures/", import.meta.url).pathname;

describe("processMarkdown", () => {
  it("transforms simple.md into separate units", async () => {
    const units = await processMarkdown(path.join(fixturesDir, "simple.md"));
    expect(units.length).toBeGreaterThanOrEqual(1);
    const allCode = units.map((u) => u.code).join("\n");
    expect(allCode).toContain("assert.deepEqual(a, 1);");
    expect(allCode).toContain("assert.deepEqual(b, 2);");
  });

  it("transforms throws.md", async () => {
    const units = await processMarkdown(path.join(fixturesDir, "throws.md"));
    expect(units.length).toBeGreaterThanOrEqual(1);
    expect(units[0].code).toContain("assert.throws(");
  });
});

describe("run", () => {
  it("executes simple.md successfully", async () => {
    const result = await run(path.join(fixturesDir, "simple.md"));
    expect(result.exitCode).toBe(0);
  });

  it("executes throws.md successfully", async () => {
    const result = await run(path.join(fixturesDir, "throws.md"));
    expect(result.exitCode).toBe(0);
  });
});
