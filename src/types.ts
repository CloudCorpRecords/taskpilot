/**
 * taskpilot types.
 *
 * Shapes follow the documented tool spec: tasks are addressed by
 * a human number such as "TCA-3" and carry a status from a fixed
 * set ("to-do", "in-progress", "done"); projects are addressed
 * by slug and can also be looked up by name. HTTP access is
 * described by a minimal response surface so tests can inject a
 * fake fetch and never touch the network.
 */

export type TaskStatus = "to-do" | "in-progress" | "done";

export interface TaskpilotConfig {
  baseUrl: string;
  apiKey: string;
}

export interface GetTaskOptions {
  number: string;
  status?: TaskStatus | string;
}

export interface UpdateTaskOptions {
  number: string;
  description?: string;
  status?: TaskStatus | string;
}

export interface NumberOptions {
  number: string;
}

export interface GetProjectOptions {
  slug?: string;
  name?: string;
}

export interface UpdateProjectOptions {
  slug: string;
  project_knowledge?: Record<string, unknown>;
  project_diagram?: string;
}

export interface SlugOptions {
  slug: string;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
