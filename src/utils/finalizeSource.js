const SourceMapConsumer = require('source-map').SourceMapConsumer;
const SourceNode = require('source-map').SourceNode;

module.exports = function finalizeSource(source) {
  const { code, map } = SourceNode
  .fromStringWithSourceMap(source.code, new SourceMapConsumer(source.map))
  .toStringWithSourceMap({ file: 'readme.md.js' });
  return {
    code,
    map: JSON.parse(map.toString()),
  };
};
