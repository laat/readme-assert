// import SourceMap from 'source-map';
import esprima from 'esprima';
import { SourceMapGenerator } from 'source-map';

const blockRe = /^([ \t]*(`{3,4}|~{3,4}))\s?(\w+)?\s?(\w+)?(\w+)?\s?(\w+)?(\w+)?(\w+)?\s?(\w+)?/;

// TODO: deprecation warning for automatic codeblock detection
// Could also add an opt to enable old behaviour

export function extractTestBlocks(markdown) {
  let lineNumber = 1;
  let insideBlock = false;
  let insideTestBlock = false;
  const lines = markdown.split('\n');
  let currentBlockLine = 0;
  let currentBlock = null;
  let currentBlockStart = null;
  const blocks = [];
  lines.forEach((line) => {
    const match = line.match(blockRe);
    if (match != null) {
      const mdStart = match[1];
      const tags = match.slice(3).filter(g => !!g);
      const matchIsTest = tags.includes('test');
      const isClosing = insideBlock && mdStart === currentBlockStart;
      if (isClosing && insideTestBlock) {
        currentBlockStart = null;
        blocks.push({ content: currentBlock.join('\n'), line: currentBlockLine });
      } else {
        currentBlock = [];
        currentBlockStart = mdStart;
        currentBlockLine = lineNumber + 1;
      }

      insideBlock = !insideBlock;
      insideTestBlock = insideBlock && matchIsTest;
      lineNumber += 1;
      return;
    }
    if (insideTestBlock) {
      currentBlock.push(line);
    }
    lineNumber += 1;
  });
  return blocks;
}
export default function extractCode(markdown) {
  const codeBlocks = extractTestBlocks(markdown);
  const map = new SourceMapGenerator({ file: 'readme.md.js', sourceRoot: '.' });
  let currentLine = 1;
  const code = codeBlocks.map((block) => {
    const tokens = esprima.tokenize(block.content, { loc: true });
    tokens.forEach((token) => {
      const loc = token.loc.start;
      map.addMapping({
        source: 'readme.md',
        original: {
          line: loc.line + (block.line - 1),
          column: loc.column,
        },
        generated: {
          line: loc.line + (currentLine - 1),
          column: loc.column,
        },
      });
    });
    currentLine += block.content.split('\n').length;
    return block.content;
  }).join('\n');
  return {
    code,
    map: JSON.parse(map.toString()),
  };
}
