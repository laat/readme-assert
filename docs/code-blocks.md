# Code Block Tags

## Tagging Blocks as Tests

Tag your fenced code blocks with `test` or `should` to mark them as tests:

````markdown
```javascript test
1 + 1; //=> 2
```

```javascript should add numbers
1 + 1; //=> 2
```
````

Only tagged blocks are executed by default. Untagged blocks are ignored,
so you can have plain examples alongside test blocks.

## Supported Languages

readme-assert supports `javascript`, `js`, `typescript`, and `ts` code blocks.

TypeScript type annotations are stripped automatically before execution.

## Grouping Blocks

Each code block runs as its own file. To share variables across blocks,
give them the same group name:

````markdown
```javascript test:math
let x = 2;
```

```javascript test:math
x; //=> 2
```
````

Blocks with the same group name are concatenated and run as a single module.
Blocks without a group name each run independently.

## Auto-Discover Mode

With `--auto`, any code block containing `//=>`, `// →`, `// ->`,
`// throws`, or `// rejects` is treated as a test — no `test` tag needed:

```
readme-assert --auto
```

## All Mode

With `--all`, every JavaScript and TypeScript code block is executed,
regardless of tags:

```
readme-assert --all
```
