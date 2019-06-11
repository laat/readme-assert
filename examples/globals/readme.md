# globals

> a setup file can be required

### Command

```
readme-assert --require ./test-setup.js
```

````
```js test
const pow2 = require("@laat/globals");
pow2(2); //=> 4
pow2(4); //=> 16
myGlobal; //=> 'hello global'6
```
````

```js test
const pow2 = require("@laat/globals");
pow2(2); //=> 4
pow2(4); //=> 16
myGlobal; //=> 'hello global'
```
