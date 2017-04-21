const SourceMapGenerator = require('source-map').SourceMapGenerator;

module.exports = function sourceMapLines(source, filename) {
  if (source.length === 0) {
    return null;
  }
  const generator = new SourceMapGenerator();
  const lines = source.split('\n');
  lines.forEach((line, i) => {
    const lineNumber = i + 1;
    generator.addMapping({
      source: filename,
      original: { line: lineNumber, column: 0 },
      generated: { line: lineNumber, column: 0 },
    });
  });
  generator.setSourceContent(filename, source);
  return {
    code: source,
    map: JSON.parse(generator.toString()),
  };
};
