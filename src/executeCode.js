import vm from 'vm';
import assert from 'assert-simple-tap';

export default function execute(code, requires = []) {
  const sandbox = Object.assign({ require, assert }, global);
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
