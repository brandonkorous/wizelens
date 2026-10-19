import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { json, type McpDataSource, type McpProject, type McpProjects, READ_ONLY, type Source } from "./mcp-shared.js";

const auditLine = (service: string, tool: string, args: unknown) => `[wizelens] mcp tool=${tool} service=${service} args=${JSON.stringify(args ?? {})}`;

/** One data source: every call reads it. */
export function singleSource(data: McpDataSource): Source {
  return {
    defaults: { slowQueryMs: data.slowQueryMs, nPlusOneThreshold: data.nPlusOneThreshold, metrics: !!data.metrics, metricRanges: data.metricRanges, overview: !!data.page },
    arg: {},
    open: async (tool, args) => (data.audit(auditLine(data.service, tool, args)), data),
  };
}

const named = (ps: readonly McpProject[]) => ps.map((p) => `${p.name} (${p.id})`).join(", ");

/** The project a call names by id or name; the only one when it names none. */
export function pickProject(ps: readonly McpProject[], wanted: string | undefined): McpProject {
  if (ps.length === 0) throw new Error("This key reads no projects.");
  if (!wanted) {
    if (ps.length === 1) return ps[0]!;
    throw new Error(`Add the project argument. This key reads: ${named(ps)}.`);
  }
  const w = wanted.trim().toLowerCase();
  const p = ps.find((x) => x.id === wanted) ?? ps.find((x) => x.name.toLowerCase() === w);
  if (!p) throw new Error(`No project "${wanted}". This key reads: ${named(ps)}.`);
  return p;
}

/** Several projects: each call names one with the `project` argument. */
export function projectsSource(m: McpProjects): Source {
  const project = z.string().max(200).optional().describe("Project id or name, from list_projects. Needed when the key reads more than one project.");
  return {
    defaults: { slowQueryMs: m.slowQueryMs, nPlusOneThreshold: m.nPlusOneThreshold, metrics: m.metrics, metricRanges: m.metricRanges, overview: !!m.overview },
    arg: { project },
    open: async (tool, args) => {
      const data = await m.open(pickProject(m.projects, (args as { project?: string }).project).id);
      data.audit(auditLine(data.service, tool, args));
      return data;
    },
    each: (tool, args) =>
      Promise.all(
        m.projects.map(async (project) => {
          const data = await m.open(project.id);
          data.audit(auditLine(data.service, tool, args));
          return { project, data };
        }),
      ),
  };
}

/** list_projects: the projects this key reads, for the `project` argument. */
export function registerProjectTools(server: McpServer, m: McpProjects): void {
  const description = "List the projects this key can read. Pass one's id or name as `project` to the other tools.";
  server.registerTool("list_projects", { description, inputSchema: {}, annotations: READ_ONLY }, async (args) => {
    m.audit(auditLine(m.service, "list_projects", args));
    return json(m.projects.map((p) => ({ id: p.id, name: p.name })));
  });
}
