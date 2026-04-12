# readme-assert

`README.md` files often become outdated because the code examples are
not regularly tested. readme-assert extracts fenced code blocks from
your readme and runs them as tests, using special comments as assertions.

## Install

```
npm install readme-assert
```

## Quick Start

Add test assertions to code blocks in your `README.md`:

````markdown
```javascript test
1 + 1 //=> 2
```
````

Run:

```
npx readme-assert
```

That's it. If any assertion fails, the process exits with a non-zero code.

## How It Works

1. Each fenced code block is extracted from the markdown
2. Blocks with the same `test:group` name are merged; others run independently
3. Assertion comments (`//=> value`) are transformed into `assert.deepEqual()` calls
4. Imports of your package name are rewritten to point to your local source
5. Each block is written to a temp file and executed with `node`

## Claude Code

There's a [`/readme-test` skill](./skill.md) for [Claude Code](https://docs.claude.com/claude-code) that runs readme-assert and walks you through any failures.
