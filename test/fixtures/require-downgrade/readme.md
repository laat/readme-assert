# Require downgrade fixture

Plain code (no `import`/`export`/`require`) with a global set by a
`--require`-loaded setup file. readme-assert should downgrade the
generated dynamic-`import` assert line to `require()` so the `.cjs`
tmp file actually goes through the `--require` hook.

```javascript test
myGlobal; //=> "hello from setup"
```
