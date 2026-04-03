# Assertion Syntax

readme-assert transforms special comments in your code blocks into
`assert.deepEqual()` or `assert.throws()` calls.

## Deep Equal

Use `//=>` after an expression to assert its value:

```javascript
let a = 1 + 1;
a; //=> 2
```

The `// →` (unicode arrow) and `// ->` (ascii arrow) variants also work:

```javascript
a; // → 2
a; // -> 2
```

## Throws

Assert that an expression throws using `// throws` with a regex pattern:

```javascript
const fail = () => { throw new Error("boom"); };
fail(); // throws /boom/
```

## Console Output

Assert console output — the call is preserved and an assertion is added:

```javascript
let obj = { a: 1 };
console.log(obj); //=> { a: 1 }
```

## Resolves

Assert that a Promise resolves to a value:

```javascript
Promise.resolve(42) //=> resolves to 42
```

The `to` is optional:

```javascript
fetch("/api") //=> resolves { ok: true }
```

This generates `assert.deepEqual(await expr, value)`.

## Rejects

Assert that a Promise rejects matching a pattern:

```javascript
fetch("/missing") // rejects /not found/
```

This generates `await assert.rejects(() => expr, /pattern/)`.

## What Gets Generated

Given:

```javascript
1 + 1 //=> 2
```

readme-assert generates:

```javascript
const { default: assert } = await import("node:assert/strict");
assert.deepEqual(1 + 1, 2);
```
