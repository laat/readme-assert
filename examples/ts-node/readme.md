# ts-node/register

> transpile typescript source files on demand with ts-node

### Command

```
readme-assert --require ts-node/register --main ./src/index.ts
```

`--require` passes through to `node --require`, which ts-node uses to
register a CJS loader hook. readme-assert writes the test block to a
`.cjs` file so the hook can transform the imported `.ts` module chain.

````
```ts test
const { pow2 } = require("@laat/ts-node");
const a: number = pow2(2);
a; //=> 4
const b: number = pow2(4);
b; //=> 16
```
````

```ts test
const { pow2 } = require('@laat/ts-node');
const a: number = pow2(2);
a; //=> 4
const b: number = pow2(4);
b; //=> 16
```
