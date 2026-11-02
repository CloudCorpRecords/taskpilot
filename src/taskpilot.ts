/**
 * taskpilot core: task and project management for AI coding
 * agents against a hosted workspace API.
 *
 * Auth: CODERIDE_API_KEY is required; a missing or blank key is
 * an error raised BEFORE any request is made. The base URL comes
 * from TASKPILOT_API_URL and defaults to https://api.coderide.ai
 * (labelled reconstruction).
 *
 * Endpoint map (documented reconstruction):
 *   get_task       GET    /tasks/{number}?status=
 *   update_task    PATCH  /tasks/{number}
 *   get_prompt     GET    /tasks/{number}/prompt
 *   get_project    GET    /projects/{slug}  or  /projects?name=
 *   update_project PATCH  /projects/{slug}
 *   start_project  POST   /projects/{slug}/start
 *   list_projects  GET    /projects
 *   list_tasks     GET    /projects/{slug}/tasks
 *   next_task      GET    /tasks/{number}/next
 *
 * All HTTP goes through an injected FetchFn so everything is
 * testable offline with a fake fetch; no live call is made here.
 */
import type {
  FetchFn,
  GetProjectOptions,
  GetTaskOptions,
  NumberOptions,
  SlugOptions,
  TaskpilotConfig,
  UpdateProjectOptions,
  UpdateTaskOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_BASE_URL = "https://api.coderide.ai";

export const BASE_URL_ENV = "TASKPILOT_API_URL";
export const API_KEY_ENV = "CODERIDE_API_KEY";

export const TASK_STATUSES = ["to-do", "in-progress", "done"] as const;

/** Resolve the API base URL: env value when non-blank, else default. Trailing slashes are stripped. */
export function resolveBaseUrl(value?: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  return (v ? v : DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/**
 * Build a config from environment-style values. The key is kept
 * as given (possibly blank); callApi rejects a blank key before
 * any request, which is the missing-key gate.
 */
export function resolveConfig(env: {
  [BASE_URL_ENV]?: string;
  [API_KEY_ENV]?: string;
}): TaskpilotConfig {
  return {
    baseUrl: resolveBaseUrl(env[BASE_URL_ENV]),
    apiKey: typeof env[API_KEY_ENV] === "string" ? env[API_KEY_ENV].trim() : "",
  };
}

function requireNonEmpty(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} must be a non-empty string`);
  return v;
}

function optionalParam(value: unknown): string | undefined {
  const v = typeof value === "string" ? value.trim() : "";
  return v ? v : undefined;
}

function requireStatus(value: unknown): string {
  const v = requireNonEmpty(value, "status");
  if (!(TASK_STATUSES as readonly string[]).includes(v)) {
    throw new Error(`status must be one of: ${TASK_STATUSES.join(", ")}`);
  }
  return v;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function callApi(
  fetchFn: FetchFn,
  config: TaskpilotConfig,
  method: string,
  path: string,
  opts: { query?: Record<string, string>; body?: Record<string, unknown> } = {},
): Promise<unknown> {
  // Missing-key gate: errors BEFORE any request is made.
  if (!config || typeof config.apiKey !== "string" || !config.apiKey.trim()) {
    throw new Error(`${API_KEY_ENV} is required: set a Coderide API key before making requests`);
  }
  let url = `${resolveBaseUrl(config.baseUrl)}${path}`;
  if (opts.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) params.set(k, v);
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${config.apiKey.trim()}`,
  };
  const init: { method: string; headers: Record<string, string>; body?: string } = { method, headers };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  let response;
  try {
    response = await fetchFn(url, init);
  } catch (err) {
    throw new Error(
      `Coderide API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload)) {
        if (typeof payload.message === "string" && payload.message) {
          detail = `: ${payload.message}`;
        } else if (typeof payload.error === "string" && payload.error) {
          detail = `: ${payload.error}`;
        }
      }
    } catch {
      // A non-JSON error body still reports its HTTP status below.
    }
    throw new Error(
      `Coderide API request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail}`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Coderide API returned a response that was not valid JSON");
  }
}

function encNumber(options: NumberOptions | GetTaskOptions | UpdateTaskOptions): string {
  return encodeURIComponent(requireNonEmpty(options.number, "number"));
}

function encSlug(options: SlugOptions | UpdateProjectOptions): string {
  return encodeURIComponent(requireNonEmpty(options.slug, "slug"));
}

// --- tasks ---------------------------------------------------------------

export async function getTask(fetchFn: FetchFn, config: TaskpilotConfig, options: GetTaskOptions): Promise<unknown> {
  const query: Record<string, string> | undefined = options.status !== undefined
    ? { status: requireStatus(options.status) }
    : undefined;
  return callApi(fetchFn, config, "GET", `/tasks/${encNumber(options)}`, { query });
}

export async function updateTask(fetchFn: FetchFn, config: TaskpilotConfig, options: UpdateTaskOptions): Promise<unknown> {
  const body: Record<string, unknown> = {};
  const description = optionalParam(options.description);
  if (description) body.description = description;
  if (options.status !== undefined) body.status = requireStatus(options.status);
  return callApi(fetchFn, config, "PATCH", `/tasks/${encNumber(options)}`, { body });
}

export async function getPrompt(fetchFn: FetchFn, config: TaskpilotConfig, options: NumberOptions): Promise<unknown> {
  return callApi(fetchFn, config, "GET", `/tasks/${encNumber(options)}/prompt`);
}

export async function nextTask(fetchFn: FetchFn, config: TaskpilotConfig, options: NumberOptions): Promise<unknown> {
  return callApi(fetchFn, config, "GET", `/tasks/${encNumber(options)}/next`);
}

// --- projects --------------------------------------------------------------

export async function getProject(fetchFn: FetchFn, config: TaskpilotConfig, options: GetProjectOptions = {}): Promise<unknown> {
  const slug = optionalParam(options.slug);
  if (slug) {
    return callApi(fetchFn, config, "GET", `/projects/${encodeURIComponent(slug)}`);
  }
  const name = optionalParam(options.name);
  return callApi(fetchFn, config, "GET", "/projects", { query: name ? { name } : undefined });
}

export async function updateProject(fetchFn: FetchFn, config: TaskpilotConfig, options: UpdateProjectOptions): Promise<unknown> {
  const body: Record<string, unknown> = {};
  if (isRecord(options.project_knowledge)) body.project_knowledge = options.project_knowledge;
  const diagram = optionalParam(options.project_diagram);
  if (diagram) body.project_diagram = diagram;
  return callApi(fetchFn, config, "PATCH", `/projects/${encSlug(options)}`, { body });
}

export async function startProject(fetchFn: FetchFn, config: TaskpilotConfig, options: SlugOptions): Promise<unknown> {
  return callApi(fetchFn, config, "POST", `/projects/${encSlug(options)}/start`);
}

export async function listProjects(fetchFn: FetchFn, config: TaskpilotConfig): Promise<unknown> {
  return callApi(fetchFn, config, "GET", "/projects");
}

export async function listTasks(fetchFn: FetchFn, config: TaskpilotConfig, options: SlugOptions): Promise<unknown> {
  return callApi(fetchFn, config, "GET", `/projects/${encSlug(options)}/tasks`);
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
