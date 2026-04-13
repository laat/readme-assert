# esbuild

> transpile TypeScript source files with esbuild

### Command

```
readme-assert --require esbuild-register --main ./src/index.ts
```

```ts test
const { pow2 } = require('@laat/esbuild');
const a: number = pow2(2);
a; //=> 4
const b: number = pow2(4);
b; //=> 16
```
