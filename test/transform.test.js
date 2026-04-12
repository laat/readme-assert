import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transform } from '../src/transform.js';
import { parse, methodName, assembled } from './helpers.js';

function findCalls(code, opts) {
  return parse(code, opts)
    .body.filter((n) => n.type === 'ExpressionStatement')
    .map((n) => {
      const e = n.expression;
      return e.type === 'AwaitExpression' ? e.argument : e;
    })
    .filter((e) => e?.type === 'CallExpression');
}

function findImports(code, opts) {
  return parse(code, opts).body.filter((n) => n.type === 'ImportDeclaration');
}

describe('transform – import hoisting', () => {
  it('hoists ESM imports and adds assert import', () => {
    const { code } = transform(
      assembled(3, 'import { foo } from "bar";\nfoo() //=> 42\n'),
      { hoistImports: true },
    );
    const imports = findImports(code);
    assert.ok(imports.some((n) => n.source.value === 'node:assert/strict'));
    assert.ok(imports.some((n) => n.source.value === 'bar'));
  });

  it('uses CJS assert when body has require()', () => {
    const { code } = transform(
      assembled(3, 'const x = require("foo");\nx; //=> 1\n'),
      { hoistImports: true },
    );
    const body = parse(code).body;
    const decl = body.find((n) => n.type === 'VariableDeclaration');
    assert.ok(decl);
    assert.equal(decl.declarations[0].init.callee?.name, 'require');
    assert.equal(
      decl.declarations[0].init.arguments[0].value,
      'node:assert/strict',
    );
  });

  it('uses dynamic import for plain code', () => {
    const { code } = transform(assembled(3, 'a; //=> 1\n'), {
      hoistImports: true,
    });
    const body = parse(code).body;
    const decl = body.find((n) => n.type === 'VariableDeclaration');
    assert.ok(decl);
    const init = decl.declarations[0].init;
    // Should be `await import(...)` — the init is an AwaitExpression wrapping an ImportExpression
    assert.equal(init.type, 'AwaitExpression');
    assert.equal(init.argument.type, 'ImportExpression');
  });

  it('handles imports without semicolons', () => {
    const { code } = transform(
      assembled(3, 'import { a } from "x"\nimport { b } from "y"\na //=> 1\n'),
      { hoistImports: true },
    );
    const imports = findImports(code);
    assert.ok(imports.some((n) => n.source.value === 'x'));
    assert.ok(imports.some((n) => n.source.value === 'y'));
    assert.ok(
      findCalls(code).some((c) => c.callee?.property?.name === 'deepEqual'),
    );
  });
});

describe('transform – typescript mode', () => {
  const ts = { typescript: true };

  it('parses and transforms TypeScript code', () => {
    const { code } = transform(
      assembled(3, 'const x: number = 1;\nx //=> 1\n'),
      { hoistImports: true, ...ts },
    );
    assert.ok(
      findCalls(code, ts).some((c) => c.callee?.property?.name === 'deepEqual'),
    );
  });

  it('handles TypeScript imports', () => {
    const { code } = transform(
      assembled(3, 'import type { Foo } from "bar";\nconst x = 1;\nx //=> 1\n'),
      { hoistImports: true, ...ts },
    );
    const imports = findImports(code, ts);
    assert.ok(imports.some((n) => n.source.value === 'node:assert/strict'));
    assert.ok(imports.some((n) => n.source.value === 'bar'));
  });
});

describe('transform – requireMode', () => {
  it('forces CJS assert for plain code when requireMode is true', () => {
    const { code, isESM } = transform(assembled(3, 'a; //=> 1\n'), {
      hoistImports: true,
      requireMode: true,
    });
    assert.equal(isESM, false);
    const body = parse(code).body;
    const decl = body.find((n) => n.type === 'VariableDeclaration');
    assert.ok(decl);
    assert.equal(decl.declarations[0].init.callee?.name, 'require');
    assert.equal(
      decl.declarations[0].init.arguments[0].value,
      'node:assert/strict',
    );
  });

  it('ESM imports take precedence over requireMode', () => {
    const { code, isESM } = transform(
      assembled(3, 'import { foo } from "bar";\nfoo() //=> 42\n'),
      { hoistImports: true, requireMode: true },
    );
    assert.equal(isESM, true);
    const imports = findImports(code);
    assert.ok(imports.some((n) => n.source.value === 'node:assert/strict'));
  });
});

describe('transform – export declarations', () => {
  it('hoists export * from as a declaration', () => {
    const { code, isESM } = transform(
      assembled(3, 'export * from "lib";\nfoo() //=> 1\n'),
      { hoistImports: true },
    );
    assert.equal(isESM, true);
    const exports = parse(code).body.filter(
      (n) => n.type === 'ExportAllDeclaration',
    );
    assert.equal(exports.length, 1);
    assert.equal(exports[0].source.value, 'lib');
  });

  it('hoists export { x } from as a declaration', () => {
    const { code, isESM } = transform(
      assembled(3, 'export { foo } from "lib";\nbar() //=> 1\n'),
      { hoistImports: true },
    );
    assert.equal(isESM, true);
    const exports = parse(code).body.filter(
      (n) => n.type === 'ExportNamedDeclaration' && n.source,
    );
    assert.equal(exports.length, 1);
    assert.equal(exports[0].source.value, 'lib');
  });

  it('renames export * from source via resolve function', () => {
    const resolve = (s) => (s === 'lib' ? '/abs/lib.js' : null);
    const { code } = transform(
      assembled(3, 'export * from "lib";\nfoo() //=> 1\n'),
      { hoistImports: true, renameImports: resolve },
    );
    const exports = parse(code).body.filter(
      (n) => n.type === 'ExportAllDeclaration',
    );
    assert.equal(exports[0].source.value, '/abs/lib.js');
  });

  it('renames export { x } from source via resolve function', () => {
    const resolve = (s) => (s === 'lib' ? '/abs/lib.js' : null);
    const { code } = transform(
      assembled(3, 'export { foo } from "lib";\nbar() //=> 1\n'),
      { hoistImports: true, renameImports: resolve },
    );
    const exports = parse(code).body.filter(
      (n) => n.type === 'ExportNamedDeclaration' && n.source,
    );
    assert.equal(exports[0].source.value, '/abs/lib.js');
  });
});

describe('transform – import renaming', () => {
  it('renames ESM import source via resolve function', () => {
    const resolve = (s) => (s === 'my-pkg' ? '/abs/path/index.js' : null);
    const { code } = transform(
      assembled(3, 'import { foo } from "my-pkg";\nfoo //=> 1\n'),
      { hoistImports: true, renameImports: resolve },
    );
    const imports = findImports(code);
    assert.ok(imports.some((n) => n.source.value === '/abs/path/index.js'));
    assert.ok(!imports.some((n) => n.source.value === 'my-pkg'));
  });

  it('renames subpath imports', () => {
    const resolve = (s) => (s === 'my-pkg/utils' ? '/abs/path/utils.js' : null);
    const { code } = transform(
      assembled(3, 'import { bar } from "my-pkg/utils";\nbar //=> 1\n'),
      { hoistImports: true, renameImports: resolve },
    );
    assert.ok(
      findImports(code).some((n) => n.source.value === '/abs/path/utils.js'),
    );
  });

  it('renames require() calls in body', () => {
    const resolve = (s) => (s === 'my-pkg' ? '/abs/path/index.js' : null);
    const { code } = transform(
      assembled(3, 'const x = require("my-pkg");\nx //=> 1\n'),
      { hoistImports: true, renameImports: resolve },
    );
    const body = parse(code).body;
    const decl = body.find(
      (n) =>
        n.type === 'VariableDeclaration' &&
        n.declarations[0]?.init?.callee?.name === 'require' &&
        n.declarations[0]?.init?.arguments[0]?.value !== 'node:assert/strict',
    );
    assert.ok(decl);
    assert.equal(
      decl.declarations[0].init.arguments[0].value,
      '/abs/path/index.js',
    );
  });

  it('handles $ in resolved file paths', () => {
    const resolve = (s) => (s === 'my-pkg' ? '/path/$1/index.js' : null);
    const { code } = transform(
      assembled(3, 'import { foo } from "my-pkg";\nfoo //=> 1\n'),
      { hoistImports: true, renameImports: resolve },
    );
    assert.ok(
      findImports(code).some((n) => n.source.value === '/path/$1/index.js'),
    );
  });
});

describe('transform – assertion comments', () => {
  it('transforms //=> to assert.deepEqual', () => {
    const { code } = transform(assembled(3, '1 + 1 //=> 2\n'), {
      hoistImports: true,
    });
    assert.ok(
      findCalls(code).some((c) => c.callee?.property?.name === 'deepEqual'),
    );
  });

  it('escapes double quotes in error messages', () => {
    const { code } = transform(
      assembled(3, 'fn() //=> Error: expected "foo"\n'),
      { hoistImports: true },
    );
    const throwsCall = findCalls(code).find(
      (c) => c.callee?.property?.name === 'throws',
    );
    assert.ok(throwsCall);
    const msgProp = throwsCall.arguments[1].properties.find(
      (p) => p.key.name === 'message' || p.key.value === 'message',
    );
    assert.ok(msgProp.value.value.includes('"foo"'));
  });

  it('escapes backslashes in error messages', () => {
    const { code } = transform(
      assembled(3, 'fn() //=> Error: path\\to\\file\n'),
      { hoistImports: true },
    );
    const throwsCall = findCalls(code).find(
      (c) => c.callee?.property?.name === 'throws',
    );
    const msgProp = throwsCall.arguments[1].properties.find(
      (p) => p.key.name === 'message' || p.key.value === 'message',
    );
    assert.ok(msgProp.value.value.includes('path\\to\\file'));
  });
});

describe('transform – sourcemaps', () => {
  it('generates sourcemap when sourceMapSource is provided', () => {
    const { map } = transform(assembled(3, '1 + 1 //=> 2\n'), {
      hoistImports: true,
      sourceMapSource: 'readme.md',
    });
    assert.ok(map);
    assert.equal(map.version, 3);
    assert.deepEqual(map.sources, ['readme.md']);
  });

  it('produces non-trivial mappings', () => {
    const { map } = transform(assembled(5, 'x; //=> 999\n'), {
      hoistImports: true,
      sourceMapSource: 'test.md',
    });
    assert.ok(map.mappings.length > 1);
  });
});

describe('transform – combined', () => {
  it('renames, hoists, and transforms assertions in one pass', () => {
    const resolve = (s) => (s === 'my-pkg' ? '/src/index.js' : null);
    const { code } = transform(
      assembled(3, 'import { add } from "my-pkg";\nadd(1, 2) //=> 3\n'),
      { hoistImports: true, renameImports: resolve },
    );
    const imports = findImports(code);
    assert.ok(imports.some((n) => n.source.value === 'node:assert/strict'));
    assert.ok(imports.some((n) => n.source.value === '/src/index.js'));
    assert.ok(
      findCalls(code).some((c) => c.callee?.property?.name === 'deepEqual'),
    );
  });
});
