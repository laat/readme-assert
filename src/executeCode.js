import vm from 'vm';

export default function execute(code, requires = [], asserter) {
  if (asserter == null) {
    asserter = require('assert-simple-tap'); // eslint-disable-line
  }
  const sandbox = Object.assign({ require, assert: asserter }, global);
  const context = new vm.createContext(sandbox); // eslint-disable-line
  requires.forEach((r) => {
    new vm.Script(`require('${r}');`, {
      filename: 'readme-assert-require',
    }).runInContext(context, { breakOnSigint: true });
  });
  if (code.map) {
    new vm.Script(`
      require('source-map-support').install({
        retrieveSourceMap: function(source) {
          if (source === 'readme.md.js') {
            return {
              url: 'readme.md',
              map: ${JSON.stringify(code.map)}
            };
          }
          return null;
        }
      });
    `, { filename: 'readme-assert-setup' })
    .runInContext(context, { breakOnSigint: true });
  }

  new vm.Script(code.code, {
    filename: 'readme.md.js',
    // source-map-support assumes module-wrapping,
    // the prefix is 56 characters.
    columnOffset: 56,
  })
  .runInContext(context, {
    breakOnSigint: true,
  });
}
