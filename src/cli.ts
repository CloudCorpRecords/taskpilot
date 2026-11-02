#!/usr/bin/env node
/**
 * taskpilot CLI. Subcommands mirror the MCP tool names:
 *
 *   taskpilot get_task --number TCA-3 [--status to-do]
 *   taskpilot update_task --number TCA-3 [--description <text>] [--status done]
 *   taskpilot get_prompt --number TCA-3
 *   taskpilot get_project [--slug <slug>] [--name <name>]
 *   taskpilot update_project --slug <slug> [--project-knowledge <json>] [--project-diagram <text>]
 *   taskpilot start_project --slug <slug>
 *   taskpilot list_projects
 *   taskpilot list_tasks --slug <slug>
 *   taskpilot next_task --number TCA-3
 *   taskpilot mcp
 *
 * Env: CODERIDE_API_KEY (required), TASKPILOT_API_URL
 * (default https://api.coderide.ai).
 * Exit codes: 0 success, 1 API error, 2 usage error.
 */
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

const TOOLS = [
  "get_task", "update_task", "get_prompt", "get_project",
  "update_project", "start_project", "list_projects",
  "list_tasks", "next_task",
];

function usage(): never {
  console.error(`Usage:
  taskpilot <tool> [flags]
  taskpilot mcp
  taskpilot --version

Tools: ${TOOLS.join(", ")}

Flags: --number <n> --status <s> --description <text> --slug <slug>
  --name <n> --project-knowledge <json> --project-diagram <text>`);
  process.exit(2);
}

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

function reqFlag(rest: string[], name: string): string {
  const v = flag(rest, name);
  if (!v) usage();
  return v;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd || !TOOLS.includes(cmd)) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const config = resolveConfig(process.env);
  try {
    let out: unknown;
    switch (cmd) {
      case "get_task": out = await getTask(fetchFn, config, { number: reqFlag(rest, "--number"), status: flag(rest, "--status") }); break;
      case "update_task": out = await updateTask(fetchFn, config, { number: reqFlag(rest, "--number"), description: flag(rest, "--description"), status: flag(rest, "--status") }); break;
      case "get_prompt": out = await getPrompt(fetchFn, config, { number: reqFlag(rest, "--number") }); break;
      case "get_project": out = await getProject(fetchFn, config, { slug: flag(rest, "--slug"), name: flag(rest, "--name") }); break;
      case "update_project": {
        const rawKnowledge = flag(rest, "--project-knowledge");
        let knowledge: Record<string, unknown> | undefined;
        if (rawKnowledge !== undefined) {
          try {
            knowledge = JSON.parse(rawKnowledge) as Record<string, unknown>;
          } catch {
            usage();
          }
        }
        out = await updateProject(fetchFn, config, {
          slug: reqFlag(rest, "--slug"),
          project_knowledge: knowledge,
          project_diagram: flag(rest, "--project-diagram"),
        });
        break;
      }
      case "start_project": out = await startProject(fetchFn, config, { slug: reqFlag(rest, "--slug") }); break;
      case "list_projects": out = await listProjects(fetchFn, config); break;
      case "list_tasks": out = await listTasks(fetchFn, config, { slug: reqFlag(rest, "--slug") }); break;
      default: out = await nextTask(fetchFn, config, { number: reqFlag(rest, "--number") }); break;
    }
    console.log(formatPayload(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
