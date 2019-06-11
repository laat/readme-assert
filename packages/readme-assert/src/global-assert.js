import native, {
  deepEqual,
  deepStrictEqual,
  doesNotThrow,
  equal,
  fail,
  ifError,
  notDeepEqual,
  notDeepStrictEqual,
  ok,
  throws
} from "assert";
import { stringify } from "tap-yaml";
import StackUtils, { nodeInternals } from "stack-utils";

console.log("TAP version 13");

let tests = 0;
let passes = 0;
let failures = 0;
const stackUtils = new StackUtils({
  internals: [...nodeInternals(), /\/readme-assert\/lib\//]
});

function printObject(obj) {
  console.log("  ---");
  console.log(stringify(obj, 4).replace(/^/gm, "  "));
  console.log("  ...");
}

function test(message, fn) {
  return (() => {
    const args = Array.prototype.slice.call(arguments);
    tests++;
    try {
      fn.apply(native, [args]);
      console.log(`ok ${tests} ${message || ""}`);
      passes++;
    } catch (err) {
      console.log(`not ok ${tests} ${message || ""}`);
      failures++;
      if ("actual" in err && "expected" in err && "operator" in err) {
        printObject({
          operator: err.operator,
          actual: err.actual,
          expected: err.expected,
          stack: stackUtils
            .clean(err.stack)
            .split("\n")
            .slice(1)
            .join("\n")
        });
      } else {
        printObject(err);
      }
    }
  })();
}

const assert = (value, message) => test(message, () => native(value, message));

assert.deepEqual = (actual, expected, message) => {
  test(message, () => deepEqual(actual, expected, message));
};

assert.deepStrictEqual = (actual, expected, message) => {
  test(message, () => deepStrictEqual(actual, expected, message));
};

assert.doesNotThrow = (block, error, message) => {
  test(message, () => doesNotThrow(block, error, message));
};

assert.equal = (actual, expected, message) => {
  test(message, () => equal(actual, expected, message));
};

assert.fail = (actual, expected, message, operator) => {
  test(message, () => fail(actual, expected, message, operator));
};

assert.ifError = value => {
  test("", () => ifError(value));
};

assert.notDeepEqual = (actual, expected, message) => {
  test(message, () => notDeepEqual(actual, expected, message));
};

assert.notDeepStrictEqual = (actual, expected, message) => {
  test(message, () => notDeepStrictEqual(actual, expected, message));
};

assert.ok = (value, message) => {
  test(message, () => ok(value, message));
};

assert.throws = (block, error, message) => {
  test(message, () => throws(block, error, message));
};

process.on("uncaughtException", err => {
  console.log(`Bail out! Uncaught exception ${err.name}`);
  printObject(err);
  process.exit(1);
});

process.on("exit", code => {
  if (code === 0) {
    console.log(`1..${tests}`);
    console.log(`# tests ${tests}`);
    console.log(`# pass ${passes}`);
    console.log(`# fail ${failures}`);
    if (failures > 0) {
      process.reallyExit(1);
    }
  }
});

global.assert = assert;
