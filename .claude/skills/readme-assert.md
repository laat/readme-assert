---
name: readme-assert
description:
  Run readme-assert on the current project's README and diagnose or fix any
  failing test blocks. Invoke when the user wants to verify their README code
  examples still work, or mentions readme-assert, outdated README examples,
  broken code samples, or /readme-assert.
---

# /readme-assert

You are helping the user verify their README's code blocks still work. The tool
is [readme-assert](https://readme-assert.laat.dev/) — it extracts fenced code
blocks tagged `test` and runs them with assertion comments transformed into real
assertions.

## Steps

1. **Find the README.** Look for `README.md` or `readme.md` in the current
   working directory. If neither exists, tell the user and stop.

2. **Run it.** Execute `npx readme-assert` with Bash.

3. **Interpret the result.**
   - **Exit 0**: all good — report that N blocks passed and stop.
   - **Exit 1, stderr is `No test code blocks found in ...`**: the README has no
     `test`-tagged blocks. Read the README, find the candidate fenced JavaScript
     / TypeScript blocks, and ask the user whether to (a) tag them explicitly by
     adding ` test` after the language fence, or (b) re-run with `--auto` so
     blocks containing assertion comments are picked up automatically. Show the
     candidates.
   - **Exit 1, stderr contains a `FAIL <path>:<line>` header followed by a
     source snippet and `expected: / received:` lines**: parse the failing line
     number, read that line in the README, understand what it's trying to
     demonstrate, and propose a targeted fix. When it's ambiguous whether the
     expected value or the code is wrong, ask before editing.
   - **Exit 1, any other error**: print the error and ask the user for guidance.

4. **After editing, re-run `npx readme-assert`** to confirm.

## Assertion Syntax

Equality (primitives use `assert.strictEqual`, objects/arrays use
`assert.deepStrictEqual`):

    expr; //=> value
    expr; // => value
    expr; // → value
    expr; // -> value

Throws:

    expr; // throws /pattern/
    expr; //=> TypeError: message
    expr; //=> TypeError: /regex/
    expr; //=> TypeError

Rejects (async):

    expr; // rejects /pattern/
    expr; //=> rejects TypeError: message

Console output (preserves the log call, adds assertion):

    console.log(expr); //=> value

Resolves (async):

    await promise; //=> value
    promise; //=> resolves to value

## Code Block Tags

Supported languages: `javascript`, `js`, `typescript`, `ts`.

Tag blocks as tests — text after `test` becomes the description in output:

    ```javascript test
    ```javascript test my description
    ```javascript should add numbers
    ```ts test

Group blocks to share scope (variables/imports carry across blocks in the same
group):

    ```javascript test:groupname
    ```javascript test:groupname step two

## CLI Options

    --file, -f        readme file to read
    --main, -m        entry point of the module
    --auto, -a        auto-discover test blocks (any block with assertion comments)
    --all, -l         run all supported code blocks
    --require, -r     require a CJS module before running (passed to node --require)
    --import, -i      import an ESM module before running (passed to node --import)
    --print-code, -p  print the transformed code

## Import Renaming

Imports of the package name (from `package.json` `name` field) are automatically
rewritten to point to local source. Resolves via `main`, `exports`, or `--main`
override. Sub-path imports and `require()` are also rewritten.

## TypeScript & Integrations

- Native (Node.js >=22.6): `readme-assert --main ./src/index.ts`
- tsx: `readme-assert --import tsx --main ./src/index.ts`
- SWC: `readme-assert --import @swc-node/register/esm-register --main ./src/index.ts`
- happy-dom: `readme-assert --import @happy-dom/global-registrator/register.js`

## Tips

- Keep fixes small. A stale `//=>` value usually just needs the expected value
  updated to match reality — check `git log` or the surrounding prose when
  unsure whether the expected or the code is canonical.
- `npx readme-assert --print-code -f <path>` prints the exact code readme-assert
  will execute for each block. Useful when a transform is doing something
  unexpected.
- Full docs at https://readme-assert.laat.dev/
