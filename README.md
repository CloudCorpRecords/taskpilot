# taskpilot

taskpilot gives AI coding agents a handle on their task board and
their projects: fetch a task by its number, move it between
statuses, pull the prompt that belongs to it, look projects up by
slug or name, refresh a project's stored knowledge and diagram,
start a project, list what is on the board, and ask which task
comes next. One binary serves a command-line interface and a
stdio MCP server.

An API key is required. Set `CODERIDE_API_KEY` before use; when
it is missing or blank, every tool fails with an error before
any request is made. The API base URL can be overridden with
`TASKPILOT_API_URL`; when it is not set, calls go to
`https://api.coderide.ai`.

Task numbers are the short human codes shown on the board, for
example `TCA-3`. A task's status is one of `to-do`,
`in-progress`, or `done`.

## Install

```bash
npx @reneturcios/taskpilot list_projects
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/taskpilot
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

The subcommands mirror the MCP tool names:

```bash
export CODERIDE_API_KEY=...

taskpilot get_task --number TCA-3
taskpilot get_task --number TCA-3 --status in-progress
taskpilot update_task --number TCA-3 --status done
taskpilot update_task --number TCA-3 --description "Revised scope notes"
taskpilot get_prompt --number TCA-3
taskpilot get_project --slug my-app
taskpilot get_project --name "My App"
taskpilot update_project --slug my-app --project-diagram "Web -> API -> DB"
taskpilot update_project --slug my-app --project-knowledge '{"stack":"typescript"}'
taskpilot start_project --slug my-app
taskpilot list_projects
taskpilot list_tasks --slug my-app
taskpilot next_task --number TCA-3

taskpilot --version
```

Results print the upstream JSON payload. Exit codes: `0` on
success, `1` when a call fails (including a missing API key or
an upstream API error), `2` for usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio
MCP server:

```bash
npx -y @reneturcios/taskpilot mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "taskpilot": {
      "command": "npx",
      "args": ["-y", "@reneturcios/taskpilot", "mcp"],
      "env": { "CODERIDE_API_KEY": "..." }
    }
  }
}
```

### Tools

| Tool | Input | What it does |
| --- | --- | --- |
| `get_task` | `number` (required), `status` | Get a task by its number, optionally filtered by status. |
| `update_task` | `number` (required), `description`, `status` | Update a task's description and/or status. |
| `get_prompt` | `number` (required) | Get the prompt belonging to a task. |
| `get_project` | `slug`, `name` | Get a project by slug or by name. |
| `update_project` | `slug` (required), `project_knowledge`, `project_diagram` | Update a project's knowledge and/or diagram. |
| `start_project` | `slug` (required) | Start a project. |
| `list_projects` | (none) | List projects in the workspace. |
| `list_tasks` | `slug` (required) | List a project's tasks. |
| `next_task` | `number` (required) | Get the task that follows the given one. |

`status` is one of `to-do`, `in-progress`, `done`.
`project_knowledge` is a JSON object.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
