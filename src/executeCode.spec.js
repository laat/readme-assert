import test from 'tape';
import printCode from './utils/printCode';
import extractCode from './extract';
import executeCode from './executeCode';

test('executes codeblocks with SourceMap', (assert) => {
  const code = extractCode(`
\`\`\` javascript test
throw new Error('I failed');
\`\`\`
  `);

  try {
    printCode(code.code);
    executeCode(code);
    assert.fail('codeblock should throw');
  } catch (err) {
    assert.ok(err.stack.toString().includes('readme.md:3'), 'map stacktraces to readme');
  }
  assert.end();
});

test('executes code with assert available globally', (assert) => {
  const code = extractCode(`
\`\`\` javascript test
if (assert == null) {
  throw new Error('assert is not available');
};
\`\`\`
  `);

  assert.doesNotThrow(() => { executeCode(code); }, 'assert exists');
  assert.end();
});
