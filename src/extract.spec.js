import test from 'tape';
import printCode from './utils/printCode';
import { extractTestBlocks } from './extract';


test('block extraction', (assert) => {
  const original = `
\`\`\`js
// ignore me
\`\`\`

\`\`\`js test
console.log('hello');
\`\`\`

\`\`\` javascript test
throw new Error('I failed');
\`\`\`
  `;
  printCode(original);
  assert.deepEqual(extractTestBlocks(original), [
    { content: 'console.log(\'hello\');', line: 7 },
    { content: 'throw new Error(\'I failed\');', line: 11 }],
  'extracts test-tagged codeblocks');
  assert.end();
});
