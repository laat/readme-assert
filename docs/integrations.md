# Integrations

readme-assert works with common transpilers and environment setup tools
via the `--require` and `--import` flags.

## TypeScript

Node.js 22.6+ strips type annotations natively — no extra tooling needed:

```
readme-assert --main ./src/index.ts
```

### tsx

Use tsx as an ESM loader for TypeScript source files:

```
npm install -D tsx
readme-assert --import tsx --main ./src/index.ts
```

### SWC

Use SWC as an ESM loader for fast TypeScript transpilation:

```
npm install -D @swc-node/register @swc/core
readme-assert --import @swc-node/register/esm-register --main ./src/index.ts
```

### esbuild

Use esbuild-register as a CJS loader hook:

```
npm install -D esbuild esbuild-register
readme-assert --require esbuild-register --main ./src/index.ts
```

This requires test blocks that use `require()` instead of `import`.

### ts-node

Use ts-node as a CJS loader hook:

```
npm install -D ts-node typescript
readme-assert --require ts-node/register --main ./src/index.ts
```

This requires a `tsconfig.json` with `"module": "CommonJS"` and test
blocks that use `require()` instead of `import`.

## Babel

Use `@babel/register` to transpile on the fly:

```
npm install -D @babel/core @babel/preset-env @babel/register
readme-assert --require @babel/register --main ./src/index.js
```

Configure Babel via `.babelrc`:

```json
{
  "presets": ["@babel/preset-env"]
}
```

## Flow

Strip Flow type annotations with the Babel plugin:

```
npm install -D @babel/core @babel/plugin-transform-flow-strip-types @babel/register
readme-assert --require @babel/register
```

```json
{
  "plugins": ["@babel/plugin-transform-flow-strip-types"]
}
```

## HTTP Mocking (nock)

Use `--import` to load a setup file that mocks HTTP responses with nock:

```
npm install -D nock
readme-assert --import ./setup.js
```

```js
// setup.js
import nock from 'nock';

nock('https://api.example.com')
  .get('/users/1')
  .reply(200, { id: 1, name: 'Alice' })
  .persist();
```

Your README test blocks can then make HTTP calls without hitting the network:

## Browser Globals (happy-dom)

Use `--import` to register browser globals like `document` and `window`:

```
npm install -D @happy-dom/global-registrator
readme-assert --import @happy-dom/global-registrator/register.js
```

## Browser Globals (jsdom)

Use `--require` with jsdom-global for a CJS-based setup:

```
npm install -D jsdom jsdom-global
readme-assert -r jsdom-global/register
```

## Custom Setup

Load a local setup file to define globals or configure the environment:

```
readme-assert --require ./test-setup.js
```

```js
// test-setup.js
global.myGlobal = 'hello global';
```
