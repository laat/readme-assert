# Require downgrade fixture

Plain code (no `import`/`export`/`require`) with a global set by a
`--require`-loaded setup file. readme-assert should downgrade the
generated dynamic-`import` assert line to `require()` and use
`--input-type=commonjs` so the `--require` hook applies.

```javascript test
myGlobal; //=> "hello from setup"
```
