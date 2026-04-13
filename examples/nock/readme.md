# nock

> mock HTTP responses in tests

### Command

```
readme-assert --import ./setup.js
```

```js test
import { getUser } from '@laat/nock';

await getUser('https://api.example.com', 1); //=> { id: 1, name: 'Alice' }
```
