import tape from 'tape';
import createTest from './transform';

function test(message, pre, post, pkg) {
  tape(message, (assert) => {
    assert.equal(createTest(pre, pkg, process.cwd(), {}).code.trim(), post.trim(), message);
    assert.end();
  });
}

test('should require correct package', `
var foobar = require('foobar');
`, `
var foobar = require('${process.cwd()}');
`, 'foobar');

test('should transform comments', `
foobar //=> true
`, `
assert.deepEqual(foobar, true);
`, 'foobar');
