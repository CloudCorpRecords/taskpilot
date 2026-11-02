/**
 * taskpilot MCP server.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * that are not in this tool's public spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schemas as explicit literals, while zod
 * still validates every tools/call argument set.
 *
 * Config is read from the environment at call time:
 * CODERIDE_API_KEY (required; a missing key errors before any
 * request), TASKPILOT_API_URL (optional, default
 * https://api.coderide.ai).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  formatPayload,
  getProject,
  getPrompt,
  getTask,
  listProjects,
  listTasks,
  nextTask,
  resolveConfig,
  startProject,
  updateProject,
  updateTask,
  VERSION,
} from "./taskpilot.js";
import type { FetchFn } from "./types.js";

const StatusEnum = z.enum(["to-do", "in-progress", "done"]);
const NoArgs = z.object({});
const GetTaskArgs = z.object({ number: z.string(), status: StatusEnum.optional() });
const UpdateTaskArgs = z.object({
  number: z.string(),
  description: z.string().optional(),
  status: StatusEnum.optional(),
});
const NumberArgs = z.object({ number: z.string() });
const GetProjectArgs = z.object({ slug: z.string().optional(), name: z.string().optional() });
const UpdateProjectArgs = z.object({
  slug: z.string(),
  project_knowledge: z.record(z.unknown()).optional(),
  project_diagram: z.string().optional(),
});
const SlugArgs = z.object({ slug: z.string() });

const STATUS_SCHEMA = { type: "string" as const, enum: ["to-do", "in-progress", "done"] };
const NUMBER_SCHEMA = {
  type: "object" as const,
  properties: { number: { type: "string", description: "Task number identifying the task." } },
  required: ["number"],
};
const SLUG_SCHEMA = {
  type: "object" as const,
  properties: { slug: { type: "string", description: "Project slug identifying the project." } },
  required: ["slug"],
};

const TOOLS = [
  {
    name: "get_task",
    description: "Get a task by its number, optionally filtered by status.",
    inputSchema: {
      type: "object" as const,
      properties: { number: { type: "string", description: "Task number identifying the task." }, status: { ...STATUS_SCHEMA, description: "Task status: to-do, in-progress, or done." } },
      required: ["number"],
    },
  },
  {
    name: "update_task",
    description: "Update a task by its number, with an optional description and status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        number: { type: "string", description: "Task number identifying the task to update." },
        description: { type: "string", description: "New task description." },
        status: { ...STATUS_SCHEMA, description: "Task status: to-do, in-progress, or done." },
      },
      required: ["number"],
    },
  },
  { name: "get_prompt", description: "Get the prompt for a task by its number.", inputSchema: NUMBER_SCHEMA },
  {
    name: "get_project",
    description: "Get a project by slug or by name.",
    inputSchema: {
      type: "object" as const,
      properties: { slug: { type: "string", description: "Project slug identifying the project." }, name: { type: "string", description: "Project name; used to find the project when no slug is given." } },
    },
  },
  {
    name: "update_project",
    description: "Update a project by slug, with optional project knowledge and project diagram.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: { type: "string", description: "Slug of the project to update." },
        project_knowledge: { type: "object", description: "Project knowledge object to store on the project." },
        project_diagram: { type: "string", description: "Project diagram text to store on the project." },
      },
      required: ["slug"],
    },
  },
  { name: "start_project", description: "Start a project by slug.", inputSchema: SLUG_SCHEMA },
  { name: "list_projects", description: "List projects in the workspace.", inputSchema: { type: "object" as const, properties: {} } },
  { name: "list_tasks", description: "List the tasks of a project by slug.", inputSchema: SLUG_SCHEMA },
  { name: "next_task", description: "Get the next task after the task with the given number.", inputSchema: NUMBER_SCHEMA },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "taskpilot", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const config = resolveConfig(process.env);
  try {
    let out: unknown;
    switch (name) {
      case "get_task": out = await getTask(fetchFn, config, GetTaskArgs.parse(args ?? {})); break;
      case "update_task": out = await updateTask(fetchFn, config, UpdateTaskArgs.parse(args ?? {})); break;
      case "get_prompt": out = await getPrompt(fetchFn, config, NumberArgs.parse(args ?? {})); break;
      case "get_project": out = await getProject(fetchFn, config, GetProjectArgs.parse(args ?? {})); break;
      case "update_project": out = await updateProject(fetchFn, config, UpdateProjectArgs.parse(args ?? {})); break;
      case "start_project": out = await startProject(fetchFn, config, SlugArgs.parse(args ?? {})); break;
      case "list_projects": NoArgs.parse(args ?? {}); out = await listProjects(fetchFn, config); break;
      case "list_tasks": out = await listTasks(fetchFn, config, SlugArgs.parse(args ?? {})); break;
      case "next_task": out = await nextTask(fetchFn, config, NumberArgs.parse(args ?? {})); break;
      default: throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
