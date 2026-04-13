# Import Renaming

When your readme imports your own package by name, readme-assert
rewrites the import to point to your local source code.

## How It Works

readme-assert reads the `name` field from the nearest `package.json`.
When it finds an import or require of that name in a code block, it
replaces it with the resolved local path.

Given a `package.json`:

```json
{
  "name": "my-package",
  "main": "index.js"
}
```

And a readme code block:

```javascript
import { foo } from 'my-package';
```

The import is rewritten to:

```javascript
import { foo } from '/absolute/path/to/index.js';
```

## Sub-path Imports

Sub-path imports are also rewritten:

```javascript
import { helper } from 'my-package/utils';
// becomes:
import { helper } from '/absolute/path/to/utils';
```

## CJS require()

CommonJS `require()` calls are rewritten too:

```javascript
const foo = require('my-package');
// becomes:
const foo = require('/absolute/path/to/index.js');
```

## Overriding with --main

Use `--main` to point to a different entry point:

```
readme-assert --main ./src/index.js
```

### TypeScript source with Node.js strip types

On Node.js 22.6+, you can point `--main` directly at a `.ts` file. Node strips
the type annotations natively — no build step or external tooling
required:

```
readme-assert --main ./src/index.ts
```

Your TypeScript source must use explicit `.ts` extensions in relative
imports (e.g. `import { foo } from './foo.ts'`) since Node's type
stripping does not perform module resolution.
