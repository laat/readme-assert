# Assertion Syntax

readme-assert transforms special comments in your code blocks into
assertion calls. Primitives use `assert.strictEqual()`, while objects and
arrays use `assert.deepStrictEqual()`. Error assertions use `assert.throws()`.

## Equality

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
const fail = () => {
  throw new Error('boom');
};
fail(); // throws /boom/
```

Or use `//=>` with an error name and optional message to match both:

```javascript
const fail = () => {
  throw new TypeError('bad input');
};
fail(); //=> TypeError: bad input
```

This generates `assert.throws(() => { expr; }, { name: "TypeError", message: "bad input" })`.
The message can also be a regex:

```javascript
fail(); //=> TypeError: /bad/
```

You can omit the message to match only the error name:

```javascript
fail(); //=> TypeError
```

When the expression uses `await`, the assertion is automatically promoted
to `assert.rejects` with an async wrapper:

```javascript
await fetch('/bad'); //=> Error: not found
```

## Console Output

Assert console output — the call is preserved and an assertion is added:

```javascript
let obj = { a: 1 };
console.log(obj); //=> { a: 1 }
```

## Resolves

Since `await` returns the resolved value, you can assert it directly:

```javascript
await Promise.resolve(42); //=> 42
```

Or use the explicit `resolves to` form without `await`:

```javascript
Promise.resolve(42); //=> resolves to 42
```

The `to` is optional:

```javascript
fetch('/api'); //=> resolves { ok: true }
```

This generates `assert.strictEqual(await expr, value)` for primitives, or
`assert.deepStrictEqual(await expr, value)` for objects and arrays.

## Rejects

Assert that a Promise rejects matching a pattern:

```javascript
fetch('/missing'); // rejects /not found/
```

This generates `await assert.rejects(() => expr, /pattern/)`.

Or match the error name and message with `//=> rejects`:

```javascript
fetch('/missing'); //=> rejects TypeError: not found
```

The message can also be a regex:

```javascript
fetch('/missing'); //=> rejects TypeError: /not found/
```

Await expressions work the same way — `// throws` and `// rejects` are
both promoted to async rejects automatically:

```javascript
await fetch('/missing'); // throws /not found/
```

## What Gets Generated

Given:

```javascript
1 + 1; //=> 2
```

readme-assert generates:

```javascript
const { default: assert } = await import('node:assert/strict');
assert.strictEqual(1 + 1, 2);
```
