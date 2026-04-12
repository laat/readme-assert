# readme-assert [![npm][npm-image]][npm-url]

[npm-image]: https://img.shields.io/npm/v/readme-assert.svg?style=flat
[npm-url]: https://npmjs.org/package/readme-assert

Code examples in READMEs go stale. readme-assert runs them as tests so
they can't.

Tag a code block, add an assertion comment, done:

````markdown
```javascript test
import { add } from 'my-package';

add(1, 2); //=> 3
```
````

```
npx readme-assert
```

Imports of your package name are rewritten to your local source
automatically.

## Install

```
npm install --save-dev readme-assert
```

## Assertions

```javascript test
let a = 1;
a; //=> 1
```

```javascript test
const fail = () => {
  throw new TypeError('bad input');
};
fail(); //=> TypeError: bad input
```

```javascript test
await Promise.resolve(true); //=> true
```

See the [full assertion syntax](https://readme-assert.laat.dev/assertions/)
for throws, rejects, console.log, and more.

## TypeScript

TypeScript blocks work out of the box — types are stripped before execution:

```typescript should add two numbers
const sum: number = 1 + 1;
sum; //=> 2
```

## Auto-discover

Skip the `test` tag entirely. With `--auto`, any block containing an
assertion comment is a test:

```
readme-assert --auto
```

## Documentation

Full docs at [readme-assert.laat.dev](https://readme-assert.laat.dev/):

- [Assertion syntax](https://readme-assert.laat.dev/assertions/) — all comment forms
- [Code block tags](https://readme-assert.laat.dev/code-blocks/) — tagging, grouping, and modes
- [Import renaming](https://readme-assert.laat.dev/import-renaming/) — how package imports are resolved
- [CLI reference](https://readme-assert.laat.dev/cli/) — all flags and options

## License

MIT
