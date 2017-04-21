import test from 'tape';
import runAsModule from './executeCode';
import sourceMapLines from './sourceMapLines';
import finalizeSource from './finalizeSource';

test('Execute with SourceMap support', (assert) => {
  if (process.version.match(/v(\d+)\./)[1] < 7) {
    assert.skip('test does not work on older versions of node');
    assert.end();
    return;
  }
  const source = finalizeSource(sourceMapLines('throw new Error(\'\')', 'original.file.js'));

  try {
    runAsModule(source, 'readme.md.js');
    assert.fail('codeblock should throw');
  } catch (err) {
    console.log(err.stack.toString()); // eslint-disable-line
    assert.ok(err.stack.toString().includes('original.file.js:1'), 'maps stacktraces');
  }
  assert.end();
});
