# Long-Running Harness (v1)

This folder provides the first version of an incremental long-running agent harness for this repository.

## Included files

- `feature_list.json`: structured feature backlog with verifiable pass state.
- `agent-progress.md`: session handoff log and execution trace.
- `session-checklist.md`: fixed steps for each coding session.
- `init.sh` / `init.bat`: environment readiness checks and startup guidance.
- `mcp.servers.example.json`: MCP server examples (browser/filesystem/git).
- `next-task.md`: next small, high-priority task to execute in one session.

## MCP setup

### 1) Install runtime helpers

Install MCP dependencies inside this repository:

```bash
# Node-based MCP servers (local to harness/)
npm install --prefix harness @playwright/mcp @modelcontextprotocol/server-filesystem

# Python git MCP server (isolated venv)
py -3 -m venv harness/.venv
harness/.venv/Scripts/pip.exe install mcp-server-git
```

### 2) Copy example config

Copy `harness/mcp.servers.example.json` into your client MCP config and merge with existing entries.

Common config path examples:

- Claude Desktop (Windows): `%APPDATA%\\Claude\\claude_desktop_config.json`
- Claude Desktop (macOS): `~/Library/Application Support/Claude/claude_desktop_config.json`
- Claude Desktop (Linux): `~/.config/Claude/claude_desktop_config.json`
- OpenCode (workspace-level common example): `.opencode/config.json`
- OpenCode (user-level common example): `~/.config/opencode/config.json`

### 3) Restart client and validate

- Restart Claude/OpenCode after config changes.
- Confirm MCP server list shows `playwright`, `filesystem`, `git`.
- Run one lightweight command from each server to confirm connectivity.

## Troubleshooting

- `npx command not found`: install Node.js 18+ and reopen terminal.
- `Python venv path not found`: create `harness/.venv` and install `mcp-server-git` again.
- Filesystem access denied: ensure the path is exactly this repo (`N:/dota2-ai-pro`).
- MCP server starts then exits: check command spelling/package name and client logs.
- Windows path issues: prefer forward slashes in MCP args (`N:/dota2-ai-pro`).
