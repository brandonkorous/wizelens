// An Express app that installs WizeLens in code, started with the auto install too. The code install must win.
import { DatabaseSync } from "node:sqlite";
import { createWizeLens } from "@wizeworks/lens-node";
import express from "express";

const wizelens = createWizeLens({ service: "code-app", storage: "memory", dashboard: false });
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)");

const app = express();
app.use(wizelens.middleware);
app.get("/notes", (_req, res) => res.json(db.prepare("SELECT * FROM notes").all()));
const server = app.listen(0, () => console.log(`ready ${server.address().port}`));
