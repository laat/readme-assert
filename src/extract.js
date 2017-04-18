// import SourceMap from 'source-map';
import esprima from 'esprima';
import { SourceMapGenerator } from 'source-map';

const blockRe = /^([ \t]*(`{3,4}|~{3,4}))\s?(\w+)?\s?(\w+)?(\w+)?\s?(\w+)?(\w+)?(\w+)?\s?(\w+)?/;

// TODO: deprecation warning for automatic codeblock detection
// Could also add an opt to enable old behaviour

export function extractTestBlocks(markdown) {
  let lineNumber = 1;
  let insideBlock = false;
  const lines = markdown.split('\n');
  let currentTags = [];
  let currentBlockLine = 0;
  let currentBlock = null;
  let currentBlockStart = null;
  const blocks = [];
  lines.forEach((line) => {
    const match = line.match(blockRe);
    if (match != null) {
      const mdStart = match[1];
      const isClosing = insideBlock && mdStart === currentBlockStart;
      if (isClosing) {
        blocks.push({
          code: currentBlock.join('\n'),
          tags: currentTags,
          line: currentBlockLine,
        });
        currentTags = [];
        currentBlockStart = null;
      } else {
        currentBlock = [];
        currentTags = match.slice(3).filter(g => !!g);
        currentBlockStart = mdStart;
        currentBlockLine = lineNumber + 1;
      }

      insideBlock = !insideBlock;
      lineNumber += 1;
      return;
    }
    if (insideBlock) {
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
  const code = codeBlocks
  .filter(block => block.tags.indexOf('test') >= 0)
  .map((block) => {
    const tokens = esprima.tokenize(block.code, { loc: true });
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
    currentLine += block.code.split('\n').length;
    return block.code;
  }).join('\n');
  return {
    code,
    map: JSON.parse(map.toString()),
  };
}
