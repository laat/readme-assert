/* eslint-disable no-plusplus, prefer-template */
const SourceMapConsumer = require('source-map').SourceMapConsumer;
const SourceMapGenerator = require('source-map').SourceMapGenerator;

module.exports = function concat(...sources) {
  const generator = new SourceMapGenerator();
  let generated = '';
  let lineOffset = 0;
  sources
  .filter(src => src != null)
  .forEach(({ code, map }) => {
    const consumer = new SourceMapConsumer(map);
    const offset = lineOffset;
    consumer.eachMapping((mapping) => {
      generator.addMapping({
        source: mapping.source,
        name: mapping.name,
        generated: {
          line: mapping.generatedLine + offset,
          column: mapping.generatedColumn,
        },
        original: {
          line: mapping.originalLine,
          column: mapping.originalColumn,
        },
      });
      lineOffset = offset + mapping.generatedLine;
    });
    if (map.sourcesContent != null) {
      for (let i = 0; i < map.sources.length; i++) {
        generator.setSourceContent(map.sources[i], map.sourcesContent[i]);
      }
    }
    generated += code + '\n';
  });
  return {
    code: generated,
    map: JSON.parse(generator.toString()),
  };
};
