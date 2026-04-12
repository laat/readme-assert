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
blocks tagged `test` (or any block containing `//=>` if `--auto` is used) and
runs them with assertion comments transformed into real assertions.

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
     blocks containing `//=>`, `// →`, `// ->`, `// throws`, or `// rejects` are
     picked up. Show the candidates.
   - **Exit 1, stderr contains a `FAIL <path>:<line>` header followed by a
     source snippet and `expected: / received:` lines**: parse the failing line
     number, read that line in the README, understand what it's trying to
     demonstrate, and propose a targeted fix. When it's ambiguous whether the
     expected value or the code is wrong, ask before editing.
   - **Exit 1, any other error**: print the error and ask the user for guidance.

4. **After editing, re-run `npx readme-assert`** to confirm.

## Tips

- Keep fixes small. A stale `//=>` value usually just needs the expected value
  updated to match reality — check `git log` or the surrounding prose when
  unsure whether the expected or the code is canonical.
- `npx readme-assert --print-code -f <path>` prints the exact code readme-assert
  will execute for each block. Useful when a transform is doing something
  unexpected (e.g., a `console.log` assertion or a TypeScript block going
  through esbuild).
- Assertion syntax cheat sheet: `expr //=> value`, `expr // throws /regex/`,
  `promise //=> resolves to value`, `promise // rejects /regex/`. Full docs at
  https://readme-assert.laat.dev/assertions/.
