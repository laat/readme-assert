---
name: readme-assertify
description:
  Convert an existing README into a readme-assert-compatible one by adding
  `test` tags and `//=>` assertion comments to JavaScript/TypeScript code blocks.
  Invoke when the user wants to make their README testable, mentions assertify,
  or asks to add readme-assert to an existing project.
---

# /readme-assertify

Convert existing README code examples into testable
[readme-assert](https://readme-assert.laat.dev/) blocks by adding `test` tags
and assertion comments.

## Steps

1. **Read the README.** Find `README.md` or `readme.md` in the current working
   directory. If neither exists, tell the user and stop.

2. **Scan code blocks.** Identify all fenced JavaScript/TypeScript blocks
   (` ```javascript `, ` ```js `, ` ```typescript `, ` ```ts `). Categorize each:
   - **Already tagged** (`test` or `test:group`) — skip.
   - **Has assertion comments** (`//=>`, `// →`, `// ->`, `// throws`,
     `// rejects`) but no `test` tag — add ` test` to the fence.
   - **Convertible** — expressions with deterministic output that can become
     self-verifying. Add `test` tag and assertion comments.
   - **Non-convertible** — setup code, shell commands, conceptual snippets, side
     effects (file writes, HTTP requests). Leave untouched.

3. **Apply edits** and show the user what changed.

4. **Run `npx readme-assert`** to confirm the converted blocks pass.

## Assertion Syntax Reference

Use these comment forms when adding assertions:

    expr; //=> value              — equality (strict for primitives, deep for objects)
    expr; // => value             — alternate spacing
    expr; // throws /pattern/     — throws matching error
    expr; //=> TypeError: message — throws specific error type
    console.log(expr); //=> value — preserves the log, adds assertion
    await promise; //=> value     — resolved value
    promise; // rejects /pattern/ — rejected value

## Transformation Patterns

- **Bare expressions with known results** → append `//=> value`
- **`console.log(expr)`** → append `//=> value` (readme-assert preserves the
  log and adds an assertion)
- **Variable assignments followed by usage** → assert on the usage expression
- **Sequential related blocks** → consider grouping with `test:groupname` so
  variables/imports carry across blocks
- **Blocks with descriptions in prose** → use text as the test description:
  ` ```javascript test description from prose `

## Important Principles

- Readability first — assertion comments should read as natural annotations, not
  test scaffolding.
- Don't force testability on conceptual or incomplete snippets. A
  partially-tested README provides more value than an awkwardly
  over-instrumented one.
- Expected values must come from surrounding documentation, code context
  analysis, or actually running the code — never guess.
- When blocks share setup (imports, variables), group them with `test:groupname`
  rather than duplicating setup code.
