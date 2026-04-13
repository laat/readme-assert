# typescript

> Node.js (>=22.6) strips type annotations natively — no external TypeScript tooling needed

Does not typecheck.

### Command

```
readme-assert --main ./src/index.ts
```

```ts test
import { pow2 } from '@laat/typescript';
const a: number = pow2(2);
a; //=> 4
const b: number = pow2(4);
b; //=> 16
```
