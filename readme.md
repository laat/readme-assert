# readme-assert [![travis][travis-image]][travis-url] [![npm][npm-image]][npm-url]
[travis-image]: https://img.shields.io/travis/laat/readme-assert.svg?style=flat
[travis-url]: https://travis-ci.org/laat/readme-assert
[npm-image]: https://img.shields.io/npm/v/readme-assert.svg?style=flat
[npm-url]: https://npmjs.org/package/readme-assert

> Run code blocks in your readme as test

`README.md` files often become outdated over time because the code
examples are not regulary tested. By commenting `javascript`
codeblocks the `README.md` file with special comments we can create
simple tests that ensures that the readme is still correct.

## Usage

```
Usage:
  readme-assert [-p] [--main=<file>] [--require=<module>...]

Options:
  -p --print-code                   Print the transformed code
  -m <file>, --main=<file>          Points to the entry point of the module
  -r <module>, --require=<module>   Require a given module
```

Write a test in the readme with special comments the tag `test` after language.

~~~~
    ```javascript test
    1 + 1 //=> 2
    ```
~~~~

Run the test in the same folder as your readme:

```
$ readme-assert
```

output:

```
TAP version 13
ok 1
# tests 1
# pass 1
# fail 0
```

Printing the evaluated code:

```
$ readme-assert --print-code
```

output:

```
# Testcode:
# 0 var assert = require("../assert.js");
# 1 "use strict";
# 2
# 3 assert.deepEqual(1 + 1 , 2);
TAP version 13
ok 1
# tests 1
# pass 1
# fail 0
```

## Sample tests

### simple
```javascript test
let a = 1
a //=> 1
```

### utf-8 arrow
```javascript test
a // → 1
```

### console.log
```javascript test
a = { "a": 1 }
console.log(a) //=> {a: 1}
```

### throws
```javascript test
const b = () => {
  throw new Error('fail');
};
b() // throws /fail/
```

## Projects using readme-assert

* [fen-chess-board](https://github.com/laat/fen-chess-board)
* [babel-plugin-transform-comment-to-assert](https://github.com/laat/babel-plugin-transform-comment-to-assert)
* [babel-plugin-transform-rename-import](https://github.com/laat/babel-plugin-transform-rename-import)
* [escape-invisibles](https://github.com/laat/escape-invisibles)
