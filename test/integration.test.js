import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { processMarkdown, run } from '../src/run.js';
import { resolveMainEntry, resolveSubpathExport } from '../src/resolve.js';

const cliPath = new URL('../src/cli.js', import.meta.url).pathname;

const fixturesDir = new URL('./fixtures/', import.meta.url).pathname;

describe('processMarkdown', () => {
  it('transforms simple.md into separate units', async () => {
    const { units } = await processMarkdown(
      path.join(fixturesDir, 'simple.md'),
    );
    assert.ok(units.length >= 1);
    const allCode = units.map((u) => u.code).join('\n');
    assert.ok(allCode.includes('assert.deepEqual(a, 1);'));
    assert.ok(allCode.includes('assert.deepEqual(b, 2);'));
  });

  it('transforms throws.md', async () => {
    const { units } = await processMarkdown(
      path.join(fixturesDir, 'throws.md'),
    );
    assert.ok(units.length >= 1);
    assert.ok(units[0].code.includes('assert.throws('));
  });

  it('rewrites imports when package.json exports is a string', async () => {
    const readme = path.join(fixturesDir, 'pkg-string-exports/readme.md');
    const expected = path.join(fixturesDir, 'pkg-string-exports/lib/main.js');
    const { units } = await processMarkdown(readme);
    const code = units.map((u) => u.code).join('\n');
    assert.ok(
      code.includes(expected),
      `expected import rewritten to ${expected}, got:\n${code}`,
    );
    assert.ok(!code.includes('"@fixture/string-exports"'));
  });

  it('rewrites subpath imports via exports map', async () => {
    const readme = path.join(fixturesDir, 'pkg-subpath-exports/readme.md');
    const expected = path.join(fixturesDir, 'pkg-subpath-exports/src/utils.js');
    const { units } = await processMarkdown(readme);
    const code = units.map((u) => u.code).join('\n');
    assert.ok(
      code.includes(expected),
      `expected subpath import rewritten to ${expected}, got:\n${code}`,
    );
    assert.ok(!code.includes('"@fixture/subpath-exports/utils"'));
  });

  it('falls back to package root when no exports map', async () => {
    const readme = path.join(fixturesDir, 'pkg-no-exports/readme.md');
    const expected = path.join(fixturesDir, 'pkg-no-exports/lib/utils.js');
    const { units } = await processMarkdown(readme);
    const code = units.map((u) => u.code).join('\n');
    assert.ok(
      code.includes(expected),
      `expected subpath rewritten to ${expected}, got:\n${code}`,
    );
  });

  it('throws NO_TEST_BLOCKS when the readme has no test blocks', async () => {
    await assert.rejects(
      () => processMarkdown(path.join(fixturesDir, 'no-blocks.md')),
      (err) => {
        assert.equal(err.code, 'NO_TEST_BLOCKS');
        assert.match(err.message, /no-blocks\.md/);
        return true;
      },
    );
  });

  it('preserves TypeScript types for ts blocks and marks unit', async () => {
    const { units } = await processMarkdown(
      path.join(fixturesDir, 'typescript.md'),
    );
    assert.equal(units.length, 1);
    assert.equal(units[0].hasTypescript, true);
    const code = units[0].code;
    // The assert calls should still be there
    assert.ok(code.includes('assert.deepEqual(a, 2);'));
    assert.ok(code.includes('assert.deepEqual(label, "two");'));
  });
});

describe('cli', () => {
  it('exits cleanly when the readme has no test blocks', () => {
    const result = spawnSync(
      'node',
      [cliPath, '-f', path.join(fixturesDir, 'no-blocks.md')],
      { encoding: 'utf-8' },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No test code blocks found/);
    // Regression: no raw stack trace or node error banner should leak.
    assert.doesNotMatch(result.stderr, /at processMarkdown/);
    assert.doesNotMatch(result.stderr, /\bNode\.js v/);
  });

  it('rejects unknown flags with a friendly message', () => {
    const result = spawnSync('node', [cliPath, '--autop'], {
      encoding: 'utf-8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /autop/);
    assert.match(result.stderr, /--help/);
    // No raw stack trace should leak from parseArgs
    assert.doesNotMatch(result.stderr, /at parseArgs/);
  });

  it('streams stdout live instead of buffering until the block finishes', async () => {
    // stream-delay.md prints "STREAM-MARKER", sleeps 500ms, then asserts.
    // With streaming, the marker should arrive well before the child exits.
    const readme = path.join(fixturesDir, 'stream-delay.md');
    const child = spawn('node', [cliPath, '-f', readme]);
    const start = Date.now();
    let markerAt = null;
    child.stdout.on('data', (chunk) => {
      if (markerAt === null && chunk.toString().includes('STREAM-MARKER')) {
        markerAt = Date.now() - start;
      }
    });
    const exitCode = await new Promise((resolve) => {
      child.on('exit', resolve);
    });
    const total = Date.now() - start;
    assert.equal(exitCode, 0);
    assert.ok(markerAt !== null, 'STREAM-MARKER never appeared in stdout');
    // The block sleeps 500ms after printing; if we're streaming, the
    // marker should arrive at least 200ms before the child exits.
    assert.ok(
      markerAt < total - 200,
      `marker arrived at ${markerAt}ms, total was ${total}ms — output looks buffered`,
    );
  });
});

describe('run', () => {
  it('executes simple.md successfully', async () => {
    const result = await run(path.join(fixturesDir, 'simple.md'));
    assert.equal(result.exitCode, 0);
  });

  it('executes throws.md successfully', async () => {
    const result = await run(path.join(fixturesDir, 'throws.md'));
    assert.equal(result.exitCode, 0);
  });

  it('executes a package with exports as string', async () => {
    const result = await run(
      path.join(fixturesDir, 'pkg-string-exports/readme.md'),
    );
    assert.equal(result.exitCode, 0, result.stderr);
  });

  it('executes a package with subpath exports', async () => {
    const result = await run(
      path.join(fixturesDir, 'pkg-subpath-exports/readme.md'),
    );
    assert.equal(result.exitCode, 0, result.stderr);
  });

  it('executes subpath imports without exports map (dirname fallback)', async () => {
    const result = await run(
      path.join(fixturesDir, 'pkg-no-exports/readme.md'),
    );
    assert.equal(result.exitCode, 0, result.stderr);
  });

  it('reports the correct line when a block contains a console.log assertion', async () => {
    // The failing expression `b; //=> 3` is on line 6 of console-shift.md.
    // Regression: the console.log transform used to insert a newline which
    // shifted later lines, pointing the error at the closing fence.
    const result = await run(path.join(fixturesDir, 'console-shift.md'));
    assert.notEqual(result.exitCode, 0);
    // node:test reports error details in stdout
    assert.match(result.stdout, /console-shift\.md:6/);
  });

  it('executes a TypeScript block end-to-end', async () => {
    const result = await run(path.join(fixturesDir, 'typescript.md'));
    assert.equal(result.exitCode, 0, result.stderr);
  });

  it('hints at test:group when ReferenceError matches another block', async () => {
    const result = await run(path.join(fixturesDir, 'ref-error-hint.md'));
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /hint:.*"greet".*test:group/);
  });

  it('runs all units even when earlier ones fail', async () => {
    const result = await run(path.join(fixturesDir, 'two-failures.md'));
    assert.notEqual(result.exitCode, 0);
    assert.equal(
      result.results.length,
      2,
      'should have results for both units',
    );
    assert.notEqual(result.results[0].exitCode, 0);
    assert.notEqual(result.results[1].exitCode, 0);
  });

  it('downgrades plain blocks to CJS so --require hooks apply', async () => {
    // Plain code (no import/export/require) + --require should use
    // --input-type=commonjs so the setup script's globals are visible.
    const readme = path.join(fixturesDir, 'require-downgrade/readme.md');
    const setup = path.join(fixturesDir, 'require-downgrade/setup.cjs');
    const result = await run(readme, { require: [setup] });
    assert.equal(result.exitCode, 0, result.stderr);
  });
});

describe('resolveMainEntry', () => {
  it('returns pkg.main when set', () => {
    assert.equal(resolveMainEntry({ main: './foo.js' }), './foo.js');
  });

  it('pkg.main takes precedence over exports', () => {
    assert.equal(
      resolveMainEntry({ main: './foo.js', exports: './bar.js' }),
      './foo.js',
    );
  });

  it('returns exports when it is a string', () => {
    assert.equal(
      resolveMainEntry({ exports: './lib/main.js' }),
      './lib/main.js',
    );
  });

  it("returns exports['.'] when it is a subpath map", () => {
    assert.equal(
      resolveMainEntry({
        exports: { '.': './lib/main.js', './sub': './sub.js' },
      }),
      './lib/main.js',
    );
  });

  it('resolves conditional exports at a subpath', () => {
    assert.equal(
      resolveMainEntry({
        exports: { '.': { import: './esm.js', require: './cjs.js' } },
      }),
      './esm.js',
    );
  });

  it('resolves bare conditional exports (no subpaths)', () => {
    assert.equal(
      resolveMainEntry({
        exports: { import: './esm.js', require: './cjs.js' },
      }),
      './esm.js',
    );
  });

  it('prefers import > default > require', () => {
    assert.equal(
      resolveMainEntry({
        exports: { require: './cjs.js', default: './default.js' },
      }),
      './default.js',
    );
    assert.equal(
      resolveMainEntry({ exports: { require: './cjs.js' } }),
      './cjs.js',
    );
  });

  it('resolves nested conditions', () => {
    assert.equal(
      resolveMainEntry({
        exports: {
          '.': {
            import: { types: './types.d.ts', default: './esm.js' },
          },
        },
      }),
      './esm.js',
    );
  });

  it('returns null when no entry can be determined', () => {
    assert.equal(resolveMainEntry({}), null);
    assert.equal(resolveMainEntry({ exports: null }), null);
  });
});

describe('resolveSubpathExport', () => {
  it('returns null for string exports', () => {
    assert.equal(resolveSubpathExport('./index.js', './utils'), null);
  });

  it('resolves a direct subpath', () => {
    const exp = { '.': './src/index.js', './utils': './src/utils.js' };
    assert.equal(resolveSubpathExport(exp, './utils'), './src/utils.js');
  });

  it('resolves a conditional subpath', () => {
    const exp = {
      '.': './src/index.js',
      './utils': { import: './src/utils.mjs', require: './src/utils.cjs' },
    };
    assert.equal(resolveSubpathExport(exp, './utils'), './src/utils.mjs');
  });

  it('returns null when subpath is not in map', () => {
    const exp = { '.': './src/index.js' };
    assert.equal(resolveSubpathExport(exp, './missing'), null);
  });

  it('returns null for bare conditional exports (no subpath keys)', () => {
    const exp = { import: './esm.js', require: './cjs.js' };
    assert.equal(resolveSubpathExport(exp, './utils'), null);
  });
});
