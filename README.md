# readme-assert

Create simple tests in your README.md

## Usage

Write a test
````
    ```javascript
    let foobar = 'foobar'
    console.log(foobar) //=> "foobar"
    ```
````

Run the test in the same folder as your readme

```
$ readme-assert
```

output:

```
# Testcode:
# 0 'use strict';
# 1
# 2 var foobar = 'foobar';
# 3 console.log(foobar);assert.deepEqual(foobar, "foobar");
foobar
TAP version 13
ok 1 - should be equivalent
1..1
# time=925.021ms
```

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
var readme = require('readme-test')
console.log(readme.foobar()) //=> "foobar"
```
