"use strict";
// The fake executor: runs the resolver of each top-level field, and answers errors in `errors`.
async function run(args) {
  const op = args.document.definitions.find((d) => d.kind === "OperationDefinition" && (!args.operationName || d.name?.value === args.operationName));
  const root = args.schema.getTypeMap()[op.operation === "mutation" ? "Mutation" : "Query"];
  const fields = root.getFields();
  const data = {};
  const errors = [];
  for (const selection of op.selectionSet.selections) {
    const key = selection.name.value;
    try {
      data[key] = await fields[key].resolve(args.rootValue, {}, args.contextValue, { fieldName: key, path: { key, prev: undefined } });
    } catch (err) {
      data[key] = null;
      errors.push({ message: err.message, path: [key], originalError: err });
    }
  }
  return errors.length ? { data, errors } : { data };
}
exports.run = run;
