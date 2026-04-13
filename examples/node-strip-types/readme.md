# node strip types

> use Node.js built-in type stripping to import TypeScript source directly

No external TypeScript tooling needed — Node.js (>=22.6) strips type
annotations natively when importing `.ts` files.

### Command

```
readme-assert --main ./src/index.ts
```

```ts test
import { pow2 } from '@laat/node-strip-types';
const a: number = pow2(2);
a; //=> 4
const b: number = pow2(4);
b; //=> 16
```
