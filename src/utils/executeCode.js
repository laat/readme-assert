/* eslint-disable new-cap, no-underscore-dangle */
const pa = require('path');
const vm = require('vm');
const Module = require('module');

function createRequire(mod) {
  const Mod = mod.constructor;
  function require(path) {
    return mod.require(path);
  }
  function resolve(request) {
    return Mod._resolveFilename(request, mod);
  }
  require.resolve = resolve;
  require.main = process.mainModule;
  require.extensions = Mod._extensions;
  require.cache = Mod._cache;
  return require;
}

function sourceMapSupport(source, filename) {
  if (source.map) {
    require('source-map-support').install({ // eslint-disable-line
      retrieveSourceMap(request) {
        if (request === source.map.file) {
          return {
            url: filename,
            map: source.map,
          };
        }
        return null;
      },
    });
  }
}

module.exports = function runAsModule(source, filename, extraGlobal = {}) {
  sourceMapSupport(source);
  const dirname = pa.dirname(filename);

  const sandbox = Object.assign({}, extraGlobal, global);
  const context = new vm.createContext(sandbox);

  const script = new vm.Script(Module.wrap(source.code), { filename, breakOnSigint: true })
  .runInContext(context, filename);
  const scriptModule = new Module(filename, module);
  scriptModule.filename = filename;
  scriptModule.paths = Module._nodeModulePaths(dirname);
  script.bind(scriptModule);

  return script(scriptModule.exports, createRequire(scriptModule), scriptModule, filename, dirname);
};
