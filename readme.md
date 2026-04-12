# readme-assert [![npm][npm-image]][npm-url]

[npm-image]: https://img.shields.io/npm/v/readme-assert.svg?style=flat
[npm-url]: https://npmjs.org/package/readme-assert

`README.md` files often become outdated because the code examples are
not regularly tested. readme-assert extracts fenced code blocks from
your readme and runs them as tests, using special comments as assertions.

## Install

```
npm install readme-assert
```

## Usage

```
Usage: readme-assert [options]

Options:
  --file, -f        readme.md file to read
  --main, -m        Entry point of the module
  --auto, -a        Auto discover test code blocks
  --all, -l         Run all supported code blocks
  --print-code, -p  Print the transformed code
  --version, -v     Show version number
  -h, --help        Show help
```

Run in the same folder as your readme:

```
$ readme-assert
```

## Writing Tests

Tag your fenced code blocks with `test` or `should`:

````
```javascript test
1 + 1 //=> 2
```
````

### Assertion Comments

Use `//=>` to assert the value of an expression:

```javascript test
let a = 1;
a; //=> 1
```

The `// →` (unicode arrow) and `// ->` (ascii arrow) variants also work:

```javascript test
let b = 1;
b; // → 1
```

### throws

Assert that an expression throws using `// throws` with a regex pattern:

```javascript test
const b = () => {
  throw new Error("fail");
};
b(); // throws /fail/
```

### console.log

Assert console output — the call is preserved and an assertion is added:

```javascript test
let a = { a: 1 };
console.log(a); //=> { a: 1 }
```

### Promises

Assert that a promise resolves to a value with `//=> resolves to`:

```javascript test
Promise.resolve(true) //=> resolves to true
```

Assert that a promise rejects with `// rejects`:

```javascript test
Promise.reject(new Error("no")) // rejects /no/
```

### TypeScript

TypeScript code blocks are supported natively:

```typescript should add two numbers
const sum: number = 1 + 1;
sum; //=> 2
```

### Grouping blocks

Each code block runs as its own file. To share variables across
blocks, give them the same group name with `test:groupname`:

````
```javascript test:math
let x = 2;
```

```javascript test:math
x; //=> 2
```
````

### Auto-discover mode

With `--auto`, any code block containing `//=>`, `// →`, `// ->`,
`// throws`, or `// rejects` is treated as a test — no `test` tag needed.

### All mode

With `--all`, every JavaScript and TypeScript code block is executed,
regardless of tags.

## How It Works

1. Each fenced code block is extracted from the markdown
2. Blocks with the same `test:group` name are merged; others run independently
3. Assertion comments (`//=> value`) are transformed into `assert.deepEqual()` calls using [oxc-parser](https://oxc.rs) and [magic-string](https://github.com/rich-harris/magic-string)
4. Imports of your package name are rewritten to point to your local source
5. Each block is written to a temp file and executed with `node`

## License

MIT
