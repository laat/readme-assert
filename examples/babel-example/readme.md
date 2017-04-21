# Transpiled javascript in test blocks

Utilizes babel by default

```js test
var pad = require('babel-example')
const toPad: number = 1; // flowtype annotations, will be stripped!
pad(toPad, 2) //=> ' 1'
```
