"use strict";
// A stand-in for graphql/execution/execute.js: a plain, writable `execute` export.
const { run } = require("./run.js");
function execute(args) {
  return run(args);
}
exports.execute = execute;
