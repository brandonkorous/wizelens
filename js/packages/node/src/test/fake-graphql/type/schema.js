"use strict";
// A stand-in for a GraphQLSchema: Query and Mutation types whose fields have resolvers, plus an introspection type.
function objectType(name, resolvers) {
  const fields = {};
  for (const [field, resolve] of Object.entries(resolvers)) fields[field] = { name: field, type: "String", resolve };
  return { name, getFields: () => fields };
}
function makeSchema(query, mutation = {}) {
  const types = {
    Query: objectType("Query", query),
    Mutation: objectType("Mutation", mutation),
    __Schema: objectType("__Schema", { types: () => [] }),
    String: { name: "String" },
  };
  return { getTypeMap: () => types };
}
exports.makeSchema = makeSchema;
