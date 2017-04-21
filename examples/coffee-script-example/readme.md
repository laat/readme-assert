# Example module developed with coffee-script

This lib is written in coffee-script, the readme-file is written in JS.

```sh
readme-assert --print-code --require coffee-script/register --main ./src/index.coffee
```

```js test
const pad = require('coffee-script-example');
pad(1, 2) //=> ' 1'
pad(1, 3) //=> '  1'
```
