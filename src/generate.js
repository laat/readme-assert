/**
 * Assemble extracted code blocks into runnable JS modules.
 *
 * Each block becomes its own module unless blocks share a group name,
 * in which case they are merged into a single module.
 *
 * @param {{ blocks: Block[], hasTypescript: boolean }} extracted
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

  // Build a line array filled with empty strings
  const lines = new Array(maxLine).fill("");

  // Place each block's code at its source position
  for (const block of blocks) {
    const codeLines = block.code.replace(/\n$/, "").split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      lines[block.startLine - 1 + i] = codeLines[i];
    }
  }

  // Separate import/export lines from body lines
  const imports = [];
  const bodyLines = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (isImportOrExport(trimmed)) {
      imports.push(lines[i]);
      bodyLines.push(""); // keep line padding
    } else {
      bodyLines.push(lines[i]);
    }
  }

  const hasESM = imports.length > 0;
  const body = bodyLines.join("\n");
  const hasAwait = /\bawait\s/.test(body);
  const hasCJS = !hasAwait && /\brequire\s*\(/.test(body);

  // Place assert import on line 0 (before markdown line 1) so line numbers
  // in the generated code match the original markdown positions exactly.
  let assertLine;
  if (hasESM) {
    assertLine = 'import assert from "node:assert/strict";';
  } else if (hasCJS) {
    assertLine = 'const assert = require("node:assert/strict");';
  } else {
    assertLine = 'const { default: assert } = await import("node:assert/strict");';
  }

  // imports go on line 0 too (they're already removed from bodyLines).
  // Each piece is its own statement, so a single space between them is
  // enough; joining with "; " produced a double semicolon like ";; ".
  const header = [assertLine, ...imports].join(" ");
  bodyLines[0] = header;
  return bodyLines.join("\n") + "\n";
}

function isImportOrExport(line) {
  return (
    /^import\s/.test(line) ||
    /^import\(/.test(line) ||
    /^export\s/.test(line)
  );
}
