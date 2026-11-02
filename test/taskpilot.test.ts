import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getProject,
  getPrompt,
  getTask,
  listProjects,
  listTasks,
  nextTask,
  resolveBaseUrl,
  resolveConfig,
  startProject,
  updateProject,
  updateTask,
} from "../src/taskpilot.js";
import type { FetchFn, HttpResponse, TaskpilotConfig } from "../src/types.js";

function jsonResponse(body: unknown, status = 200, statusText = "OK"): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

interface Captured {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  calls: number;
}

function fakeFetch(body: unknown = {}): { fetchFn: FetchFn; captured: Captured } {
  const captured: Captured = { calls: 0 };
  const fetchFn: FetchFn = async (url, init) => {
    captured.calls += 1;
    captured.url = url;
    captured.method = init?.method;
    captured.headers = init?.headers;
    captured.body = init?.body;
    return jsonResponse(body);
  };
  return { fetchFn, captured };
}

const BASE = "https://api.coderide.ai";
const CFG: TaskpilotConfig = { baseUrl: BASE, apiKey: "test-key" };

describe("config resolution", () => {
  it("defaults base URL, strips trailing slashes, honours env overrides", () => {
    assert.equal(resolveBaseUrl(undefined), BASE);
    assert.equal(resolveBaseUrl("  "), BASE);
    assert.equal(resolveBaseUrl("https://example.test/api/"), "https://example.test/api");
    const cfg = resolveConfig({ CODERIDE_API_KEY: " key ", TASKPILOT_API_URL: "https://example.test/" });
    assert.equal(cfg.apiKey, "key");
    assert.equal(cfg.baseUrl, "https://example.test");
  });
});

describe("missing API key gate", () => {
  it("errors BEFORE any request when the key is missing (spy)", async () => {
    let called = false;
    const spy: FetchFn = async () => { called = true; return jsonResponse({}); };
    const noKey: TaskpilotConfig = { baseUrl: BASE, apiKey: "" };
    await assert.rejects(() => listProjects(spy, noKey), /CODERIDE_API_KEY is required/);
    await assert.rejects(() => getTask(spy, noKey, { number: "TCA-3" }), /CODERIDE_API_KEY is required/);
    assert.equal(called, false);
  });

  it("sends the Bearer API key header with requests", async () => {
    const { fetchFn, captured } = fakeFetch({ ok: true });
    await listProjects(fetchFn, CFG);
    assert.equal(captured.headers?.Authorization, "Bearer test-key");
  });
});

describe("tasks", () => {
  it("get_task hits /tasks/{number} without a query when no status is given", async () => {
    const { fetchFn, captured } = fakeFetch({ number: "TCA-3", status: "to-do" });
    const out = await getTask(fetchFn, CFG, { number: "TCA-3" });
    assert.equal(captured.method, "GET");
    assert.equal(captured.url, `${BASE}/tasks/TCA-3`);
    assert.deepEqual(out, { number: "TCA-3", status: "to-do" });
  });

  it("get_task passes a valid status as a query parameter", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await getTask(fetchFn, CFG, { number: "TCA-3", status: "in-progress" });
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/tasks/TCA-3");
    assert.equal(url.searchParams.get("status"), "in-progress");
  });

  it("get_task rejects an invalid status before any request", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await assert.rejects(() => getTask(fetchFn, CFG, { number: "TCA-3", status: "blocked" }), /status must be one of/);
    assert.equal(captured.calls, 0);
  });

  it("update_task PATCHes only the supplied fields", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await updateTask(fetchFn, CFG, { number: "TCA-3", status: "done" });
    assert.equal(captured.method, "PATCH");
    assert.equal(captured.url, `${BASE}/tasks/TCA-3`);
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), { status: "done" });
    const b = fakeFetch({});
    await updateTask(b.fetchFn, CFG, { number: "TCA-3", description: "new text", status: "in-progress" });
    assert.deepEqual(JSON.parse(b.captured.body ?? "{}"), { description: "new text", status: "in-progress" });
  });

  it("update_task rejects an invalid status before any request", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await assert.rejects(() => updateTask(fetchFn, CFG, { number: "TCA-3", status: "nope" }), /status must be one of/);
    assert.equal(captured.calls, 0);
  });

  it("blank number is rejected before any request", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await assert.rejects(() => getTask(fetchFn, CFG, { number: "  " }), /number/);
    assert.equal(captured.calls, 0);
  });

  it("get_prompt and next_task hit their paths", async () => {
    const a = fakeFetch({ prompt: "do it" });
    const out = await getPrompt(a.fetchFn, CFG, { number: "TCA-3" });
    assert.equal(a.captured.url, `${BASE}/tasks/TCA-3/prompt`);
    assert.deepEqual(out, { prompt: "do it" });
    const b = fakeFetch({});
    await nextTask(b.fetchFn, CFG, { number: "TCA-3" });
    assert.equal(b.captured.url, `${BASE}/tasks/TCA-3/next`);
  });
});

describe("projects", () => {
  it("list_projects hits /projects", async () => {
    const { fetchFn, captured } = fakeFetch([]);
    await listProjects(fetchFn, CFG);
    assert.equal(captured.method, "GET");
    assert.equal(captured.url, `${BASE}/projects`);
  });

  it("get_project by slug hits /projects/{slug}; by name uses a query", async () => {
    const a = fakeFetch({});
    await getProject(a.fetchFn, CFG, { slug: "my-app" });
    assert.equal(a.captured.url, `${BASE}/projects/my-app`);
    const b = fakeFetch({});
    await getProject(b.fetchFn, CFG, { name: "My App" });
    const url = new URL(b.captured.url ?? "");
    assert.equal(url.pathname, "/projects");
    assert.equal(url.searchParams.get("name"), "My App");
  });

  it("update_project PATCHes knowledge and diagram", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await updateProject(fetchFn, CFG, {
      slug: "my-app",
      project_knowledge: { stack: "typescript" },
      project_diagram: "A -> B",
    });
    assert.equal(captured.method, "PATCH");
    assert.equal(captured.url, `${BASE}/projects/my-app`);
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), {
      project_knowledge: { stack: "typescript" },
      project_diagram: "A -> B",
    });
  });

  it("start_project POSTs to /projects/{slug}/start", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await startProject(fetchFn, CFG, { slug: "my-app" });
    assert.equal(captured.method, "POST");
    assert.equal(captured.url, `${BASE}/projects/my-app/start`);
  });

  it("list_tasks hits /projects/{slug}/tasks", async () => {
    const { fetchFn, captured } = fakeFetch([]);
    await listTasks(fetchFn, CFG, { slug: "my-app" });
    assert.equal(captured.method, "GET");
    assert.equal(captured.url, `${BASE}/projects/my-app/tasks`);
  });

  it("blank slug is rejected before any request", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await assert.rejects(() => listTasks(fetchFn, CFG, { slug: "" }), /slug/);
    assert.equal(captured.calls, 0);
  });

  it("honours a custom base URL", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await listProjects(fetchFn, { baseUrl: "https://example.test/api/", apiKey: "k" });
    assert.equal(captured.url, "https://example.test/api/projects");
  });
});

describe("errors", () => {
  it("HTTP 401 surfaces status and upstream message", async () => {
    const failing: FetchFn = async () => jsonResponse({ message: "bad key" }, 401, "Unauthorized");
    await assert.rejects(() => listProjects(failing, CFG), /HTTP 401.*bad key/);
  });

  it("network failure is wrapped with context", async () => {
    const failing: FetchFn = async () => { throw new Error("socket hang up"); };
    await assert.rejects(() => listProjects(failing, CFG), /Coderide API request failed: socket hang up/);
  });
});
