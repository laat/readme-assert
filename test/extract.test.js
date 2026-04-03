import { describe, it, expect } from "vitest";
import { extractBlocks } from "../src/extract.js";

describe("extractBlocks", () => {
  it("extracts tagged test blocks", () => {
    const md = [
      "# Hello",
      "",
      "```javascript test",
      "1 + 1 //=> 2",
      "```",
    ].join("\n");

    const { blocks, hasTypescript } = extractBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe("1 + 1 //=> 2\n");
    expect(blocks[0].lang).toBe("javascript");
    expect(blocks[0].tag).toBe("test");
    expect(blocks[0].startLine).toBe(4);
    expect(hasTypescript).toBe(false);
  });

  it("extracts 'should' tagged blocks", () => {
    const md = [
      "```javascript should equal 1",
      "let a = 1;",
      "a; //=> 1",
      "```",
    ].join("\n");

    const { blocks } = extractBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].tag).toBe("should equal 1");
  });

  it("skips untagged blocks in default mode", () => {
    const md = [
      "```javascript",
      "const x = 1;",
      "```",
      "",
      "```javascript test",
      "x; //=> 1",
      "```",
    ].join("\n");

    const { blocks } = extractBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toContain("//=> 1");
  });

  it("auto mode detects assertion comments", () => {
    const md = [
      "```javascript",
      "1 + 1 //=> 2",
      "```",
      "",
      "```javascript",
      "const x = 1;",
      "```",
    ].join("\n");

    const { blocks } = extractBlocks(md, { auto: true });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toContain("//=> 2");
  });

  it("auto mode detects utf-8 arrow", () => {
    const md = [
      "```javascript",
      "1 + 1 // → 2",
      "```",
    ].join("\n");

    const { blocks } = extractBlocks(md, { auto: true });
    expect(blocks).toHaveLength(1);
  });

  it("auto mode detects throws", () => {
    const md = [
      "```javascript",
      "fn() // throws /err/",
      "```",
    ].join("\n");

    const { blocks } = extractBlocks(md, { auto: true });
    expect(blocks).toHaveLength(1);
  });

  it("all mode includes every JS/TS block", () => {
    const md = [
      "```javascript",
      "const x = 1;",
      "```",
      "",
      "```python",
      "x = 1",
      "```",
      "",
      "```typescript",
      "const y: number = 2;",
      "```",
    ].join("\n");

    const { blocks, hasTypescript } = extractBlocks(md, { all: true });
    expect(blocks).toHaveLength(2);
    expect(blocks[0].lang).toBe("javascript");
    expect(blocks[1].lang).toBe("typescript");
    expect(hasTypescript).toBe(true);
  });

  it("tracks correct startLine across multiple blocks", () => {
    const md = [
      "# Title",           // 1
      "",                   // 2
      "Some text.",         // 3
      "",                   // 4
      "```javascript test", // 5
      "let a = 1;",        // 6
      "```",               // 7
      "",                   // 8
      "```javascript test", // 9
      "let b = 2;",        // 10
      "```",               // 11
    ].join("\n");

    const { blocks } = extractBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].startLine).toBe(6);
    expect(blocks[1].startLine).toBe(10);
  });

  it("handles ts and js shorthand langs", () => {
    const md = [
      "```ts test",
      "const x: number = 1;",
      "```",
      "",
      "```js test",
      "const y = 2;",
      "```",
    ].join("\n");

    const { blocks, hasTypescript } = extractBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].lang).toBe("ts");
    expect(blocks[1].lang).toBe("js");
    expect(hasTypescript).toBe(true);
  });

  it("returns empty blocks array when no matches", () => {
    const md = "# Just a title\n\nSome text.";
    const { blocks } = extractBlocks(md);
    expect(blocks).toHaveLength(0);
  });

  it("parses group from test:groupname tag", () => {
    const md = [
      "```javascript test:mygroup",
      "let x = 1;",
      "```",
      "",
      "```javascript test:mygroup",
      "x; //=> 1",
      "```",
    ].join("\n");

    const { blocks } = extractBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].group).toBe("mygroup");
    expect(blocks[1].group).toBe("mygroup");
  });

  it("ungrouped blocks have null group", () => {
    const md = [
      "```javascript test",
      "1; //=> 1",
      "```",
    ].join("\n");

    const { blocks } = extractBlocks(md);
    expect(blocks[0].group).toBeNull();
  });

  it("parses group from should:groupname tag", () => {
    const md = [
      "```javascript should:g1 work",
      "1; //=> 1",
      "```",
    ].join("\n");

    const { blocks } = extractBlocks(md);
    expect(blocks[0].group).toBe("g1");
  });
});
