# babel-register

> using ts-node/register

### Command

```
readme-assert --require ts-node/register --main ./src/index.ts
```

````
```js test
import { pow2 } from "@laat/ts-node";
const a: number = pow2(2);
a; //=> 4
const b: number = pow2(4);
b; //=> 16
```
````

```js test
import { pow2 } from "@laat/ts-node";
const a: number = pow2(2);
a; //=> 4
const b: number = pow2(4);
b; //=> 16
```
