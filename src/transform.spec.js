import prettier from "prettier";
import assert from "assert-simple-tap";
import createTest from "./transform";

function format(val) {
  return prettier.format(val.split(/\s/).join(""), { parser: "babel" });
}

function test(message, pre, post, pkg) {
  assert.equal(
    format(createTest(pre, pkg, process.cwd(), {}).trim(), {
      parser: "babel"
    }),
    format(post, { parser: "babel" }),
    message
  );
}

test(
  "should require correct package",
  `
var foobar = require('foobar');
`,
  `
var foobar = require('${process.cwd()}');
`,
  "foobar"
);

test(
  "should transform comments",
  `
foobar //=> true
`,
  `
assert.deepEqual(foobar, true);
`,
  "foobar"
);
