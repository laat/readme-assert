const path = require("path");
const vm = require("vm");
const Module = require("module");

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

export const runInThisContext = (code, filename) => {
  const script = new vm.Script(Module.wrap(code), {
    filename,
    paths: path.dirname(filename),
    breakOnSigint: true
  }).runInThisContext();
  const scriptModule = new Module(filename, module);
  scriptModule.filename = filename;
  scriptModule.paths = Module._nodeModulePaths(path.dirname(filename));
  script.bind(scriptModule);
  return script(
    scriptModule.exports,
    createRequire(scriptModule),
    scriptModule,
    filename,
    path.dirname(filename)
  );
};
