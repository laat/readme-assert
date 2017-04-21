# Transpiled javascript in test blocks

Executes the typescript-source for pad with ts-node

```
readme-assert --print-code --require ts-node/register --main ./src/index.ts
```

```js test
var pad = require('typescript-example').default;
pad(1, 2); //=> ' 1'
pad(1, 3); //=> '  1'
```

Unfortunately, code blocks must still be written in JavaScript.
