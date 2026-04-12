# Stream delay fixture

Prints a marker, then waits, then asserts. With `stream: true` the
marker should appear in `process.stdout` well before the block's
delay elapses.

```javascript test
console.log('STREAM-MARKER');
await new Promise((r) => setTimeout(r, 500));
1; //=> 1
```
