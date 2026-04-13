/**
 * @import { Block } from "./extract.js"
 */

/**
 * @typedef {{
 *   code: string,
 *   name: string,
 *   hasTypescript: boolean,
 *   blocks: Array<{ startLine: number, endLine: number, description: string | null }>,
 * }} Unit
 */

/**
 * @param {{ blocks: Block[] }} extracted
 * @returns {{ units: Unit[] }}
 */
export function generate({ blocks }) {
  if (blocks.length === 0) return { units: [] };

  /** @type {Map<string, { blocks: Block[], name: string }>} */
  const groups = new Map();
  /** @type {{ blocks: Block[], name: string }[]} */
  const units = [];

  for (const block of blocks) {
    if (block.group) {
      if (!groups.has(block.group)) {
        const entry = {
          blocks: /** @type {Block[]} */ ([]),
          name: block.group,
        };
        groups.set(block.group, entry);
        units.push(entry);
      }
      /** @type {{ blocks: Block[], name: string }} */ (
        groups.get(block.group)
      ).blocks.push(block);
    } else {
      units.push({
        blocks: [block],
        name: block.tag || `line ${block.startLine}`,
      });
    }
  }

  return {
    units: units.map((unit) => ({
      code: assembleUnit(unit.blocks),
      name: unit.name,
      hasTypescript: unit.blocks.some(
        (b) => b.lang === 'typescript' || b.lang === 'ts',
      ),
      blocks: unit.blocks.map((b) => ({
        startLine: b.startLine,
        endLine: b.endLine,
        description: b.description,
      })),
    })),
  };
}

/**
 * @param {Block[]} blocks
 * @returns {string}
 */
function assembleUnit(blocks) {
  const maxLine = Math.max(...blocks.map((b) => b.endLine));

  const lines = new Array(maxLine).fill('');

  for (const block of blocks) {
    const codeLines = block.code.replace(/\n$/, '').split('\n');
    for (let i = 0; i < codeLines.length; i++) {
      lines[block.startLine - 1 + i] = codeLines[i];
    }
  }

  return lines.join('\n') + '\n';
}
