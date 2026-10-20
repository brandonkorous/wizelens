"use strict";
// A stand-in for graphql 16's CommonJS index: it re-exports with getters only, like the real one.
Object.defineProperty(exports, "__esModule", { value: true });
const execution = require("./execution/execute.js");
const parser = require("./language/parser.js");
const schema = require("./type/schema.js");
Object.defineProperty(exports, "execute", { enumerable: true, get: () => execution.execute });
Object.defineProperty(exports, "parse", { enumerable: true, get: () => parser.parse });
Object.defineProperty(exports, "makeSchema", { enumerable: true, get: () => schema.makeSchema });
