/**
 * Extract tagged code blocks from a markdown string.
 *
 * @param {string} markdown
 * @param {{ auto?: boolean, all?: boolean }} options
 * @returns {{ blocks: Block[], hasTypescript: boolean }}
 *
 * Block: { code, lang, tag, group, startLine, endLine }
 *
 * Tags: "test", "test:groupname", "should description", "should:groupname description"
 * Blocks with the same group name are merged into a single execution unit.
 * Blocks without a group name each run independently.
 */
export function extractBlocks(markdown, { auto = false, all = false } = {}) {
  // Based on gfm-code-block-regex — the backreference \2 ensures a 4-backtick
  // fence only closes with 4 backticks, so nested display fences are skipped.
  const fenceRe = /^(([ \t]*`{3,4})([^\n]*)([\s\S]+?)(^[ \t]*\2))/gm;
  const supportedLangs = new Set(["javascript", "js", "typescript", "ts"]);
  const tsLangs = new Set(["typescript", "ts"]);
  const assertRe = /\/[/*]\s*(=>|→|->|throws|rejects)/;

  let hasTypescript = false;
  const blocks = [];
  let match;

  while ((match = fenceRe.exec(markdown)) !== null) {
    const infoString = match[3].trim();
    const code = match[4].replace(/^\n/, "");
    const blockStart = match.index;

    // Parse language and tag from info string (e.g. "javascript test" or "ts test:group")
    const parts = infoString.split(/\s+/);
    const lang = parts[0] || "";
    const tag = parts.slice(1).join(" ");

    if (!supportedLangs.has(lang)) continue;

    // Filter by mode
    if (!all) {
      if (auto) {
        if (!assertRe.test(code)) continue;
      } else {
        const firstWord = tag.split(/\s+/)[0] || "";
        const keyword = firstWord.split(":")[0];
        if (keyword !== "test" && keyword !== "should") continue;
      }
    }

    // Count lines before this block to get startLine (1-based)
    const linesBeforeBlock = markdown.slice(0, blockStart).split("\n").length;
    const startLine = linesBeforeBlock + 1; // +1 for the fence line itself
    const codeLines = code.split("\n").length;
    const endLine = startLine + codeLines - 1;

    if (tsLangs.has(lang)) hasTypescript = true;

    // Parse group from tag: "test:mygroup ..." or "should:mygroup ..."
    const firstTagWord = tag.split(/\s+/)[0] || "";
    const colonIdx = firstTagWord.indexOf(":");
    const group = colonIdx !== -1 ? firstTagWord.slice(colonIdx + 1) : null;

    blocks.push({ code, lang, tag, group, startLine, endLine });
  }

  return { blocks, hasTypescript };
}
