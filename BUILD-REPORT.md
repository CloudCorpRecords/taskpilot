# taskpilot — Build Report

MCP Rebuild 1000. Clean-room rebuild of PixdataOrg/coderide-mcp
(MCP Registry rank 191, 2 stars), built from the public README
spec captured in
`harness/fixtures/coderide-mcp-tools-original.json`. That
fixture is docs-derived: the tools are the full documented set
of 9 and the input schemas are as documented in the README —
no original server was probed. Parity proves the rebuild
matches this program's defined spec, labelled docs-derived.
Local build only — nothing pushed or published.

Identity: repo `taskpilot`, npm `@reneturcios/taskpilot`,
MCP name `io.github.CloudCorpRecords/taskpilot`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `taskpilot: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Task and project management for
  AI coding agents: tasks, prompts, projects, next task."
  = **86 chars** (≤100 ✓); npm entry carries `version: 0.1.0`;
  OCI entry `ghcr.io/cloudcorprecords/taskpilot:0.1.0` carries
  **no** `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/taskpilot"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27)
- `src/index.ts`, `src/cli.ts` (subcommands mirror the tool
  names, plus `mcp` and `--version`; exit 2 usage / 1 API error),
  `src/mcp.ts`, `src/types.ts`, `src/taskpilot.ts` (core logic,
  `VERSION = "0.1.0"`)
- `test/taskpilot.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to taskpilot)

## Tools implemented (9)

`get_task`, `update_task`, `get_prompt`, `get_project`,
`update_project`, `start_project`, `list_projects`,
`list_tasks`, `next_task` — the full documented set from the
task spec, as recorded in the fixture `_source`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the standing fleet rule: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the defined spec
  and break exact schema parity. Zod still validates every
  `tools/call`, including the documented status enum
  (`to-do`, `in-progress`, `done`).
- Schemas are exactly as documented in the README:
  `get_task` takes a required `number` (e.g. `TCA-3`) plus an
  optional `status` enum; `update_task` a required `number` plus
  optional `description` and `status` enum; `get_prompt` and
  `next_task` a required `number`; `get_project` an optional
  `slug` or `name`; `update_project` a required `slug` plus
  optional `project_knowledge` (object) and `project_diagram`;
  `start_project` and `list_tasks` a required `slug`;
  `list_projects` no properties.
- Endpoints under the base URL (env `TASKPILOT_API_URL`, default
  `https://api.coderide.ai`, trailing slashes stripped — the
  default is labelled a reconstruction) follow the map in the
  `src/taskpilot.ts` header: `/tasks/{number}` (GET with the
  optional status as a query, PATCH for updates),
  `/tasks/{number}/prompt`, `/tasks/{number}/next`,
  `/projects/{slug}` (GET/PATCH), `/projects?name=` for name
  lookups, `/projects/{slug}/start`, `/projects`, and
  `/projects/{slug}/tasks`. Path and method choices are
  reconstructions, labelled as such.
- Auth: `CODERIDE_API_KEY` is required. A missing or blank key
  raises an error naming `CODERIDE_API_KEY` **before any request
  is made** (the call gate sits ahead of the fetch invocation; a
  spy test proves the fetch is never called). The key is sent as
  `Authorization: Bearer <key>`.
- Status values are validated against the documented enum in
  the core as well as in the MCP zod schemas, so an invalid
  status is rejected before any request on both faces.
- HTTP failures surface the status plus the upstream `message`
  or `error` string when present.
- All HTTP flows through an injectable `FetchFn` (types.ts). The
  test suite uses a fake fetch returning hand-written
  workspace-shaped JSON fixtures; no live call is made in tests.

## Verification (foreground, exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo tsc_exit=$?
tsc_exit=0
```
`dist/` produced, including `dist/cli.js`.

### 2. Tests
```
$ npm test   (tsx --test test/*.test.ts)
ℹ tests 19
ℹ pass 19
ℹ fail 0
```
Covers: base-URL default/custom/trailing-slash handling and
config resolution from env; the missing-key-before-request spy
test (fetch never called) and the Bearer key header on a real
(fake) request; get_task path with and without the status
query, invalid status and blank number rejected before any
request; update_task PATCH bodies (status only, and description
plus status) and invalid-status rejection; get_prompt and
next_task paths; list_projects path; get_project by slug and by
name; update_project PATCH body with knowledge object and
diagram; start_project POST path; list_tasks path; blank slug
rejected before any request; custom base URL; HTTP 401
surfacing the upstream message; network failure wrapping.

### 3. CLI / MCP smoke
`--version` → `0.1.0` (exit 0); unknown command exits 2 with
Usage. MCP `initialize` over stdio → `serverInfo:
{"name":"taskpilot","version":"0.1.0"}`; `tools/list` returned
9 tools; a stdio `tools/call` for `list_projects` with no key in
the environment returned an `isError` result naming
`CODERIDE_API_KEY` — the missing-key gate, exercised end to end
with no live Coderide call made and none claimed.

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/coderide-mcp-tools-original.json \
    --rebuild "stdio:node .../builds/taskpilot/dist/cli.js mcp" \
    --out /tmp/taskpilot-parity
verdict=PASS parity_pct=100.0 original_tools=9 rebuild_tools=9 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 9/9.) Original side is tools-file
mode, so `fixture_results` records `SKIPPED-TOOLS-FILE-MODE` —
expected harness semantics, not an error. The parity output was
written to /tmp and its parity.json/parity.md were copied into
`parity-out/` and verified non-empty (1204 and 895 bytes).

## Lockfile status

`package-lock.json` was generated clean via Route 3: a temp copy
holding only `package.json` (no `node_modules`), offline
`npm install --package-lock-only --ignore-scripts`, verified
after generation — parses as JSON, top-level `name` is
`@reneturcios/taskpilot`, version `0.1.0`, `lockfileVersion` 3,
128 package entries — then only the lockfile was copied back.
Local `node_modules` is a sibling copy (sociallens) used only
for the local build/test; it is not part of the lockfile
generation.

## Gaps / honest notes

- Docs-derived spec: the endpoint paths and methods, the base
  URL default (`https://api.coderide.ai`), and the Bearer header
  choice are documented reconstructions from the README's tool
  descriptions, per the task spec — no original coderide-mcp
  server was probed, so parity proves the rebuild matches this
  program's defined spec, not a hand-probed original.
- `get_project` with neither slug nor name falls back to a
  plain `GET /projects` in this rebuild; the documented schema
  makes both fields optional and does not say which wins when
  both are supplied — slug takes precedence here. Both choices
  are reconstructions.
- No live call was made: every endpoint is fake-fetch tested
  only, so live payload/response-shape drift against
  api.coderide.ai is unverified until the publish wave.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
