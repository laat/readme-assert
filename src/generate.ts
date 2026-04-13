import type { Block } from './extract.ts';

export type Unit = {
  code: string;
  name: string;
  hasTypescript: boolean;
  blocks: Array<{
    startLine: number;
    endLine: number;
    description: string | null;
  }>;
};

export function generate({ blocks }: { blocks: Block[] }): {
  units: Unit[];
} {
  if (blocks.length === 0) return { units: [] };

  const groups = new Map<string, { blocks: Block[]; name: string }>();
  const units: { blocks: Block[]; name: string }[] = [];

  for (const block of blocks) {
    if (block.group) {
      if (!groups.has(block.group)) {
        const entry = {
          blocks: [] as Block[],
          name: block.group,
        };
        groups.set(block.group, entry);
        units.push(entry);
      }
      groups.get(block.group)!.blocks.push(block);
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

function assembleUnit(blocks: Block[]): string {
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
