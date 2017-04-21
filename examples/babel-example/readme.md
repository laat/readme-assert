# Babel

```
$ readme-assert --print-code -r babel-core/register --main ./src/index.js
```

* Code blocks in the readme is transpiled with babel by default.
* The main module, which must be transpiled is `src/index.js`
* The library is transpiled via `babel-core/register`

```js test
import pad from 'babel-example';
const toPad: number = 1; // flowtype annotations, will be stripped!
pad(toPad, 2) //=> ' 1'
pad(toPad, 3) //=> '  1'
```
