# CLI Reference

```
Usage: readme-assert [options]

Options:
  --file, -f        readme.md file to read
  --main, -m        Entry point of the module
  --auto, -a        Auto discover test code blocks
  --all, -l         Run all supported code blocks
  --require, -r     Require a module before running          [array]
  --import, -i      Import a module before running           [array]
  --print-code, -p  Print the transformed code
  --version, -v     Show version number
  -h, --help        Show help
```

## Examples

Run tests in the current directory's readme:

```
readme-assert
```

Specify a file:

```
readme-assert --file docs/API.md
```

Auto-discover test blocks:

```
readme-assert --auto
```

Print the transformed code (useful for debugging):

```
readme-assert --print-code
```

## Using --require

The `--require` flag loads a module before test execution. This is useful
for setting up environments like jsdom or registering transpilers like
Babel:

```
readme-assert --require jsdom-global/register
readme-assert --require @babel/register --main ./src/index.js
readme-assert --require ./test-setup.js
```

`--require` modules are passed directly to `node --require`, so they
must be CommonJS modules that run synchronously.

## Using --import

The `--import` flag loads an ESM module before test execution. This is
the recommended way to set up browser globals:

```
readme-assert --import ./setup.mjs
```

For example, to get `document`, `window`, `location` etc. using
[happy-dom](https://github.com/capricorn86/happy-dom):

```
npm install -D @happy-dom/global-registrator
readme-assert --import @happy-dom/global-registrator/register.js
```

## Using --main

By default, readme-assert resolves imports of your package name using
the `main` or `exports` field in `package.json`. Use `--main` to
override:

```
readme-assert --main ./src/index.js
```

You can also point `--main` at a `.ts` file. On Node.js 22.6+ (or 23.6+
stable), type annotations are stripped natively:

```
readme-assert --main ./src/index.ts
```

## Module Detection

readme-assert detects whether your code blocks use ESM or CJS:

- **ESM imports/exports** → `.mjs` temp file with static `import assert`
- **`require()` calls** → `.cjs` temp file with `const assert = require(...)`
- **Neither** → `.mjs` temp file with `await import()` (top-level await)

When `--require` is passed and the code has no CJS syntax, readme-assert
downgrades to CJS so that require hooks work correctly.
