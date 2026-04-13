import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { commentToAssert } from '../src/transform.js';
import { parse, assertCall, assertAwaitedCall, methodName } from './helpers.js';

describe('commentToAssert', () => {
  it('transforms //=> to assert.strictEqual for primitives', () => {
    const call = assertCall(commentToAssert('1 + 1 //=> 2').code);
    assert.equal(methodName(call), 'assert.strictEqual');
    assert.equal(call.arguments.length, 2);
  });

  it('transforms // => with space', () => {
    const call = assertCall(commentToAssert('x // => 42').code);
    assert.equal(methodName(call), 'assert.strictEqual');
  });

  it('transforms // → with utf-8 arrow', () => {
    const call = assertCall(commentToAssert('a // → 1').code);
    assert.equal(methodName(call), 'assert.strictEqual');
  });

  it('transforms // -> with ascii arrow', () => {
    const call = assertCall(commentToAssert('a // -> 1').code);
    assert.equal(methodName(call), 'assert.strictEqual');
  });

  it('transforms // throws to assert.throws', () => {
    const call = assertCall(commentToAssert('fn() // throws /err/').code);
    assert.equal(methodName(call), 'assert.throws');
    assert.equal(call.arguments[0].type, 'ArrowFunctionExpression');
    assert.equal(call.arguments[1].type, 'Literal');
  });

  it('transforms bare // throws to assert.throws with no matcher', () => {
    const call = assertCall(commentToAssert('fn() // throws').code);
    assert.equal(methodName(call), 'assert.throws');
    assert.equal(call.arguments.length, 1);
    assert.equal(call.arguments[0].type, 'ArrowFunctionExpression');
  });

  it('transforms bare // rejects to assert.rejects with no matcher', () => {
    const call = assertCall(commentToAssert('fetch() // rejects').code);
    assert.equal(methodName(call), 'assert.rejects');
    assert.equal(call.arguments.length, 1);
  });

  it('handles console.log: keeps log and adds assertion', () => {
    const body = parse(
      commentToAssert('console.log(a) //=> { a: 1 }').code,
    ).body;
    const calls = body
      .filter((n) => n.type === 'ExpressionStatement')
      .map((n) => n.expression);
    assert.ok(calls.some((c) => c.callee?.object?.name === 'console'));
    assert.ok(calls.some((c) => methodName(c) === 'assert.deepStrictEqual'));
  });

  it('console.log with multiple statements', () => {
    const body = parse(
      commentToAssert('console.log(a) //=> 1\nlet b = 2;\nb; //=> 2').code,
    ).body;
    const calls = body
      .filter((n) => n.type === 'ExpressionStatement')
      .map((n) => n.expression)
      .filter((e) => e.type === 'CallExpression');
    const methods = calls.map(methodName);
    assert.ok(methods.includes('assert.strictEqual'));
    assert.ok(methods.includes('console.log'));
  });

  it('handles object expected values', () => {
    const call = assertCall(commentToAssert('x //=> { a: 1, b: 2 }').code);
    assert.equal(methodName(call), 'assert.deepStrictEqual');
    assert.equal(call.arguments[1].type, 'ObjectExpression');
  });

  it('handles array expected values', () => {
    const call = assertCall(commentToAssert('arr //=> [1, 2, 3]').code);
    assert.equal(methodName(call), 'assert.deepStrictEqual');
    assert.equal(call.arguments[1].type, 'ArrayExpression');
  });

  it('handles await expression with //=> value', () => {
    const call = assertCall(
      commentToAssert('await Promise.resolve(true) //=> true').code,
    );
    assert.equal(methodName(call), 'assert.strictEqual');
    assert.equal(call.arguments[0].type, 'AwaitExpression');
  });

  it('handles string expected values', () => {
    const call = assertCall(commentToAssert('x //=> "hello"').code);
    assert.equal(call.arguments[1].value, 'hello');
  });

  it('leaves non-assertion code untouched', () => {
    const input = 'const x = 1;\nconst y = 2;';
    assert.equal(commentToAssert(input).code, input);
  });

  it('ignores //=> with no value after it', () => {
    const { code } = commentToAssert('x //=>\n');
    const body = parse(code).body;
    const calls = body
      .filter((n) => n.type === 'ExpressionStatement')
      .map((n) => n.expression)
      .filter((e) => e.type === 'CallExpression');
    assert.equal(calls.length, 0);
  });

  it('handles multiple assertions', () => {
    const body = parse(commentToAssert('a //=> 1\nb //=> 2').code).body;
    const calls = body
      .filter((n) => n.type === 'ExpressionStatement')
      .map((n) => n.expression);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => methodName(c) === 'assert.strictEqual'));
  });

  it('leaves regular comments alone', () => {
    const input = '// this is a comment\nconst x = 1;';
    assert.equal(commentToAssert(input).code, input);
  });

  it('handles throws with regex flags', () => {
    const call = assertCall(commentToAssert('fn() // throws /err/i').code);
    assert.equal(methodName(call), 'assert.throws');
    assert.match(call.arguments[1].raw, /\/err\/i/);
  });

  it('transforms //=> resolves to value', () => {
    const call = assertCall(
      commentToAssert('Promise.resolve(true) //=> resolves to true').code,
    );
    assert.equal(methodName(call), 'assert.strictEqual');
    assert.equal(call.arguments[0].type, 'AwaitExpression');
  });

  it("transforms //=> resolves value (without 'to')", () => {
    const call = assertCall(commentToAssert('fetch() //=> resolves 42').code);
    assert.equal(methodName(call), 'assert.strictEqual');
    assert.equal(call.arguments[0].type, 'AwaitExpression');
  });

  it('transforms // rejects', () => {
    const call = assertCall(
      commentToAssert('fetch() // rejects /not found/').code,
    );
    assert.equal(methodName(call), 'assert.rejects');
    assert.equal(call.arguments[1].type, 'Literal');
  });

  it('transforms //=> rejects Error: message', () => {
    const call = assertCall(
      commentToAssert('fetch() //=> rejects Error: not found').code,
    );
    assert.equal(methodName(call), 'assert.rejects');
    assert.equal(call.arguments[1].type, 'ObjectExpression');
  });

  it('transforms //=> rejects TypeError: /regex/', () => {
    const call = assertCall(
      commentToAssert('fetch() //=> rejects TypeError: /timeout/i').code,
    );
    assert.equal(methodName(call), 'assert.rejects');
  });

  it('transforms //=> rejects RangeError without message', () => {
    const call = assertCall(
      commentToAssert('fetch() //=> rejects RangeError').code,
    );
    assert.equal(methodName(call), 'assert.rejects');
  });

  it('transforms //=> Error: message to assert.throws', () => {
    const call = assertCall(
      commentToAssert('JSON.parse(bad) //=> Error: Unexpected token').code,
    );
    assert.equal(methodName(call), 'assert.throws');
    assert.equal(call.arguments[1].type, 'ObjectExpression');
  });

  it('transforms //=> TypeError: message to assert.throws with name', () => {
    const call = assertCall(
      commentToAssert(
        "obj.name //=> TypeError: Cannot read property 'name' of undefined",
      ).code,
    );
    assert.equal(methodName(call), 'assert.throws');
  });

  it('transforms //=> TypeError: /regex/ to assert.throws with regex message', () => {
    const call = assertCall(
      commentToAssert('fn() //=> TypeError: /bad input/').code,
    );
    assert.equal(methodName(call), 'assert.throws');
  });

  it('transforms //=> Error: /regex/ with flags', () => {
    const call = assertCall(
      commentToAssert('fn() //=> Error: /missing \\w+/i').code,
    );
    assert.equal(methodName(call), 'assert.throws');
  });

  it('transforms //=> RangeError without message', () => {
    const call = assertCall(commentToAssert('fn() //=> RangeError').code);
    assert.equal(methodName(call), 'assert.throws');
  });

  it('promotes await expr //=> Error: to async rejects', () => {
    const call = assertAwaitedCall(
      commentToAssert('await fetch() //=> Error: not found').code,
    );
    assert.equal(methodName(call), 'assert.rejects');
    assert.equal(call.arguments[0].async, true);
  });

  it('promotes await expr // throws to async rejects', () => {
    const call = assertAwaitedCall(
      commentToAssert('await fn() // throws /err/').code,
    );
    assert.equal(methodName(call), 'assert.rejects');
  });

  it('promotes await expr // throws with no matcher to async rejects', () => {
    const call = assertAwaitedCall(
      commentToAssert('await fn() // throws').code,
    );
    assert.equal(methodName(call), 'assert.rejects');
    assert.equal(call.arguments.length, 1);
    assert.equal(call.arguments[0].async, true);
  });

  it('wraps await expr // rejects with no matcher in async callback', () => {
    const call = assertAwaitedCall(
      commentToAssert('await fetch() // rejects').code,
    );
    assert.equal(methodName(call), 'assert.rejects');
    assert.equal(call.arguments.length, 1);
  });

  it('wraps await expr // rejects in async callback', () => {
    const call = assertAwaitedCall(
      commentToAssert('await fetch() // rejects /err/').code,
    );
    assert.equal(methodName(call), 'assert.rejects');
  });

  it('wraps await expr //=> rejects Error: in async callback', () => {
    const call = assertAwaitedCall(
      commentToAssert('await fetch() //=> rejects TypeError: timeout').code,
    );
    assert.equal(methodName(call), 'assert.rejects');
    assert.equal(call.arguments[0].async, true);
  });

  it('escapes double quotes in error message strings', () => {
    const call = assertCall(
      commentToAssert('fn() //=> Error: expected "foo"').code,
    );
    assert.equal(methodName(call), 'assert.throws');
    const matcher = call.arguments[1];
    const msgProp = matcher.properties.find(
      (p) => p.key.name === 'message' || p.key.value === 'message',
    );
    assert.ok(msgProp.value.value.includes('"foo"'));
  });
});
