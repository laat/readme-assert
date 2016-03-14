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
# 0 var assert = require("assert");
# 1 "use strict";
# 2
# 3 var foobar = 'foobar';
# 4 console.log(foobar);assert.deepEqual(foobar, "foobar");
foobar
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
var readme = require('readme-assert')
console.log(readme.foobar()) //=> "foobar"
```
