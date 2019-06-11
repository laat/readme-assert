# auto detect test blocks

The default behavior is to detect code blocks tagged with `test`:

````
```js test
1 + 1 // => 1
```
````

We can also try to infer the tests to run with the `--auto` flag, which tries tries to find magic comments `//=>` in the documentation.

````
```js
1 + 1 // => 1
```
````

### Command

```
readme-assert --auto
```

```js
const pow2 = require("@laat/auto");
pow2(2); //=> 4
pow2(4); //=> 16
```
