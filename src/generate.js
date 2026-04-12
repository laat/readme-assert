export function generate({ blocks }) {
  if (blocks.length === 0) return { units: [] };

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
  const maxLine = Math.max(...blocks.map((b) => b.endLine));

  // Line 0 is a single-space placeholder that transform() overwrites with the
  // assert import + hoisted declarations.
  const lines = new Array(maxLine).fill("");
  lines[0] = " ";

  for (const block of blocks) {
    const codeLines = block.code.replace(/\n$/, "").split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      lines[block.startLine - 1 + i] = codeLines[i];
    }
  }

  return lines.join("\n") + "\n";
}
