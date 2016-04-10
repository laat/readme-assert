# readme-assert

`README.md` files often become outdated over time because the code
examples are not regulary tested. By commenting `javascript`
codeblocks the `README.md` file with special comments we can create
simple tests that ensures that the readme is still correct.

## Usage

```
Usage:
  readme-assert [--main=<file>] [--require=<module>...]
```

Write a test in the readme with special comments `//=>`.

~~~~
    ```javascript
    1 + 1 //=> 2
    ```
~~~~

Run the test in the same folder as your readme:

```
$ readme-assert
```

output:

````
# Testcode:
# 0 var assert = require("assert");
# 1 "use strict";
# 2
# 3 assert.deepEqual(1 +1 , 2);
````

## Sample tests

```javascript
let a = 1
a //=> 1
```

```javascript
a = { "a": 1 }
console.log(a) //=> {a: 1}
```

```javascript
var readme = require('readme-assert')
console.log(readme.foobar()) //=> "foobar"
```
