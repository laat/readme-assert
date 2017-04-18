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
    { code: '// ignore me', line: 3, tags: ['js'] },
    { code: 'console.log(\'hello\');', line: 7, tags: ['js', 'test'] },
    { code: 'throw new Error(\'I failed\');', line: 11, tags: ['javascript', 'test'] }],
  'extracts test-tagged codeblocks');
  assert.end();
});
