# Changelog

## 0.1.0 (2026-10-27)

- Initial release.
- CLI subcommands mirror the MCP tools, plus `taskpilot mcp`
  and `--version`.
- MCP server (`taskpilot mcp`, stdio) with the full documented
  tool set: get and update tasks, get a task's prompt, get and
  update projects, start a project, list projects, list a
  project's tasks, and get the next task.
- Calls go to the workspace API under the base URL from
  `TASKPILOT_API_URL`, defaulting to `https://api.coderide.ai`.
- `CODERIDE_API_KEY` is required and a missing key errors
  before any request.
- Task status is validated against the documented set
  (`to-do`, `in-progress`, `done`) before any request.
- All HTTP goes through an injectable fetch function, so the
  test suite runs entirely on hand-written fixtures with no
  network access.
