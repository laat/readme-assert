/**
 * Assemble extracted code blocks into runnable JS modules.
 *
 * Each block becomes its own module unless blocks share a group name,
 * in which case they are merged into a single module.
 *
 * Blocks are placed at their original markdown line positions so that
 * error stack traces point to the correct line in the readme.  Line 0
 * (before any markdown content) is reserved as a single-space slot for
 * the header that `transform()` will fill in later.
 *
 * @param {{ blocks: Block[] }} extracted
 * @returns {{ units: Array<{ code: string, name: string, hasTypescript: boolean }> }}
 */
export function generate({ blocks }) {
  if (blocks.length === 0) return { units: [] };

  // Group blocks: blocks with a group name are merged, others are standalone
  const groups = new Map();
  const units = [];

  for (const block of blocks) {
    if (block.group) {
      if (!groups.has(block.group)) {
        const entry = { blocks: [], name: block.group };
        groups.set(block.group, entry);
        units.push(entry);
      }
      groups.get(block.group).blocks.push(block);
    } else {
      units.push({ blocks: [block], name: block.tag || `line ${block.startLine}` });
    }
  }

  return {
    units: units.map((unit) => ({
      code: assembleUnit(unit.blocks),
      name: unit.name,
      hasTypescript: unit.blocks.some((b) => b.lang === "typescript" || b.lang === "ts"),
    })),
  };
}

function assembleUnit(blocks) {
  // Find the last line number we need to cover
  const maxLine = Math.max(...blocks.map((b) => b.endLine));

  // Build a line array filled with empty strings.
  // Line 0 gets a single space — a slot that transform() overwrites with the
  // assert import + hoisted declarations.  Using a non-empty placeholder keeps
  // the line count stable (s.overwrite requires start < end).
  const lines = new Array(maxLine).fill("");
  lines[0] = " ";

  // Place each block's code at its source position
  for (const block of blocks) {
    const codeLines = block.code.replace(/\n$/, "").split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      lines[block.startLine - 1 + i] = codeLines[i];
    }
  }

  return lines.join("\n") + "\n";
}
