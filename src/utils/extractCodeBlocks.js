const blockRe = /^([ \t]*(`{3,4}|~{3,4}))\s?(\w+)?\s?(\w+)?(\w+)?\s?(\w+)?(\w+)?(\w+)?\s?(\w+)?/;
module.exports = function extractCodeBlocks(markdown) {
  const lines = markdown.split('\n');

  let lineNumber = 1;
  let insideBlock = false;

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
};
