"use strict";
// A stand-in for graphql's parser: one operation, its top-level fields, and the source location.
function parse(body) {
  const head = /^\s*(query|mutation|subscription)?\s*([_A-Za-z]\w*)?/.exec(body);
  const selections = [];
  let depth = 0;
  let parens = 0;
  for (const match of body.replace(/"[^"]*"/g, '""').matchAll(/[{}()]|[_A-Za-z]\w*/g)) {
    const token = match[0];
    if (token === "{") depth++;
    else if (token === "}") depth--;
    else if (token === "(") parens++;
    else if (token === ")") parens--;
    else if (depth === 1 && parens === 0) selections.push({ kind: "Field", name: { value: token } });
  }
  const name = head[2] ? { kind: "Name", value: head[2] } : undefined;
  const operation = { kind: "OperationDefinition", operation: head[1] ?? "query", name, selectionSet: { selections } };
  return { kind: "Document", definitions: [operation], loc: { start: 0, end: body.length, source: { body } } };
}
exports.parse = parse;
