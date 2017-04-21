/* eslint-disable prefer-template, comma-dangle */
const babel = require('babel-core');
const SourceMapConsumer = require('source-map').SourceMapConsumer;
const SourceMapGenerator = require('source-map').SourceMapGenerator;

const extractCodeBlocs = require('./extractCodeBlocks');


module.exports = function parseMarkdown(markdown, filename, babelOpts = {}) {
  const generator = new SourceMapGenerator();
  let lastLine = 0;

  const concactMap = (mapConsumer, generatedOffset, originalOffset) => {
    mapConsumer.eachMapping((m) => {
      generator.addMapping({
        source: filename,
        original: {
          line: originalOffset + m.originalLine,
          column: m.originalColumn,
        },
        generated: {
          line: generatedOffset + m.generatedLine,
          column: m.generatedColumn,
        },
        name: m.name,
      });
      lastLine = generatedOffset + m.generatedLine;
    });
  };

  let code = '';
  const concatCode = (c) => {
    code += c + '\n';
  };

  extractCodeBlocs(markdown)
  .filter(block => block.tags.indexOf('test') >= 0)
  .forEach((block) => {
    const opts = Object.assign(
      {},
      { filename, sourceMap: true }, // , sourceType: 'script'
      babelOpts
    );
    const { code: blockCode, map: blockMap } = babel.transform(block.code, opts);
    const mapConsumer = new SourceMapConsumer(blockMap);
    concactMap(mapConsumer, lastLine, block.line - 1);
    concatCode(blockCode);
  });
  generator.setSourceContent(filename, markdown);
  return {
    code,
    map: JSON.parse(generator.toString()),
  };
};
