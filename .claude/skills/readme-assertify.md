---
name: readme-assertify
description:
  Convert an existing README into a readme-assert-compatible one by adding
  `test` tags and `//=>` assertion comments to JavaScript/TypeScript code blocks.
  Invoke when the user wants to make their README testable, mentions assertify,
  or asks to add readme-assert to an existing project.
disable-model-invocation: true
---

# /readme-assertify

You are converting an existing README's code blocks into testable
[readme-assert](https://readme-assert.laat.dev/) blocks. The goal is to make as
many code examples as possible runnable and self-verifying, while keeping the
README natural and readable.

## Arguments

- `$ARGUMENTS` — optional path to the markdown file (defaults to `README.md` /
  `readme.md` in the current working directory).

## Steps

1. **Find the README.** Use `$ARGUMENTS` if provided, otherwise look for
   `README.md` or `readme.md` in the current working directory.

2. **Read the README** and identify every fenced JavaScript / TypeScript code
   block (` ```js `, ` ```javascript `, ` ```ts `, ` ```typescript `).

3. **Find package.json** in the same directory to learn the package name and
   exports. You will need this to understand which imports refer to the package
   itself.

4. **Classify each code block** into one of these categories:

   a. **Already tagged** — has `test`, `should`, or a group tag after the
   language. Skip these.

   b. **Has assertion comments** — contains `//=>`, `// =>`, `// →`, `// ->`,
   `// throws`, or `// rejects` but no `test` tag. Just add ` test` after the
   language identifier on the fence line.

   c. **Convertible** — does not have assertion comments yet, but contains
   expressions whose results could be asserted. These are your main targets.
   Look for:
   - Bare expressions on their own line (e.g., `foo.bar()`)
   - `console.log(expr)` calls — these almost always print a value the reader
     is meant to see; replace or annotate with `//=> expectedValue`
   - Variable assignments followed by usage that implies a result
   - Function calls whose return value is demonstrated in surrounding prose

   d. **Not convertible** — setup code, configuration, shell commands, code that
   requires external services, or intentionally incomplete snippets. Leave
   these alone.

5. **Convert each convertible block.** For each block in categories (b) and (c):
   - **Add ` test` to the fence line** (e.g., ` ```js ` → ` ```js test `).
   - **Add assertion comments** to key expressions. Use the assertion syntax:
     - `expr //=> expectedValue` for return values and expressions
     - `expr // throws` or `expr //=> Error: message` for expected errors
     - `await expr //=> resolves to value` for promises
     - `await expr // rejects` for rejected promises
   - **Convert `console.log` patterns.** If the block has
     `console.log(result)` and surrounding text or comments indicate the output,
     transform to `result //=> expectedValue` or keep the console.log and add
     `console.log(result) //=> expectedValue`.
   - **Determine expected values** by:
     - Reading the surrounding prose for stated outputs
     - Running the code mentally or actually executing it
     - Looking at variable names and context clues
   - **Group related blocks** that share state using `test:groupname` tags
     (e.g., two blocks where the first defines a variable and the second uses
     it).

6. **Handle imports.** readme-assert automatically rewrites imports of the
   package name to the local source. So `import { foo } from "my-package"` in
   the README will work if `my-package` matches `package.json`'s `name` field.
   No changes needed for these imports.

7. **Present changes to the user.** Before editing, show a summary:
   - How many blocks were already tagged
   - How many blocks you are adding `test` tags to
   - How many blocks you are leaving unconverted, and why
   - Any blocks where you are unsure about the expected value — ask before
     assuming

8. **Apply edits** to the README after user confirmation.

9. **Verify** by running `npx readme-assert` (or `npx readme-assert -f <path>`
   if not the default README). Fix any failures iteratively.

## Guidelines

- **Keep the README readable.** Assertion comments should feel like natural
  inline annotations, not test noise. Prefer `//=> value` over verbose assert
  calls.
- **Don't force it.** If a code block is conceptual, partial, or requires
  external state, leave it alone. A README with 3 tested blocks and 2 untested
  ones is better than one where you've hacked 5 blocks into awkward testability.
- **Prefer `//=>` over `// throws`.** Only use throws/rejects when the block is
  explicitly demonstrating error handling.
- **Use groups sparingly.** Only group blocks when the README's narrative
  clearly builds state across multiple fenced blocks (e.g., "First, create a
  client: ... Now use it: ...").
- **Watch for side effects.** Blocks that write files, make HTTP requests, or
  modify global state may need mocking or should be left unconverted.
- **`console.log` is special.** readme-assert preserves the console.log call and
  asserts on its first argument: `console.log(x) //=> 42` becomes both the log
  call and `assert.deepEqual(x, 42)`.
