#!/usr/bin/env bash
# Install the Nolto Cursor plugin into Cursor's standard config locations.
#
# Why a script: cursor-agent's `--plugin-dir` does NOT register a plugin's MCP
# servers or skills (verified on cursor-agent 2026.06.15). Until the Cursor
# marketplace auto-wires bundled plugins, v0.1.0 installs into Cursor's standard,
# confirmed locations:
#   - skills -> <cursor>/skills/<name>/SKILL.md
#   - hooks  -> merged into <cursor>/hooks.json  (.hooks.stop)
#   - mcp    -> merged into <cursor>/mcp.json    (.mcpServers.nolto)
#
# <cursor> = ~/.cursor (user, default) or ./.cursor (project, with --project).
# Existing MCP servers and hooks are preserved (jq merge). Idempotent.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

SCOPE="user"
case "${1:-}" in
  --project) SCOPE="project" ;;
  ""|--user) SCOPE="user" ;;
  *) echo "usage: install.sh [--user|--project]" >&2; exit 2 ;;
esac

if [ "$SCOPE" = "project" ]; then
  CURSOR_DIR="$(pwd)/.cursor"
else
  CURSOR_DIR="${HOME}/.cursor"
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (merges mcp.json / hooks.json without clobbering existing entries)." >&2
  echo "       install jq, or follow the manual steps in README.md." >&2
  exit 1
fi

echo "Installing Nolto Cursor plugin into ${CURSOR_DIR} (${SCOPE} scope)..."

# --- skills (additive copy; re-runnable) ---
mkdir -p "${CURSOR_DIR}/skills"
for d in "${PLUGIN_ROOT}/skills/"*/; do
  name="$(basename "$d")"
  rm -rf "${CURSOR_DIR}/skills/${name:?}"
  cp -R "$d" "${CURSOR_DIR}/skills/${name}"
  echo "  skill: ${name} -> ${CURSOR_DIR}/skills/${name}/"
done

# --- mcp.json (set .mcpServers.nolto; preserve other servers) ---
mcp_target="${CURSOR_DIR}/mcp.json"
new_mcp="$(cat "${PLUGIN_ROOT}/mcp.json")"
if [ -f "$mcp_target" ]; then
  merged="$(jq -n --argjson cur "$(cat "$mcp_target")" --argjson new "$new_mcp" \
    '$cur + {mcpServers: (($cur.mcpServers // {}) + $new.mcpServers)}')"
else
  merged="$new_mcp"
fi
printf '%s\n' "$merged" > "$mcp_target"
echo "  mcp:   nolto -> ${mcp_target}"

# --- hooks.json (add the nolto stop hook; preserve other hooks; dedupe ours) ---
hooks_target="${CURSOR_DIR}/hooks.json"
new_hooks="$(cat "${PLUGIN_ROOT}/hooks/hooks.json")"
if [ -f "$hooks_target" ]; then
  merged="$(jq -n --argjson cur "$(cat "$hooks_target")" --argjson new "$new_hooks" '
    ($cur // {}) + {
      version: 1,
      hooks: (($cur.hooks // {}) + {
        stop: ((($cur.hooks.stop // []) | map(select((.command // "") | contains("nolto flush") | not))) + $new.hooks.stop)
      })
    }')"
else
  merged="$new_hooks"
fi
printf '%s\n' "$merged" > "$hooks_target"
echo "  hook:  stop -> ${hooks_target} (nolto flush at session end)"

cat <<'EONOTE'

Done. Next steps:
  - Desktop Cursor: the first nolto tool call opens an OAuth consent in your browser.
  - Headless / CI (no browser): set NOLTO_TOKEN and add a Bearer header to the
    nolto entry in mcp.json — see README.md "ヘッドレス / CI 環境". The installer
    writes the zero-secret url-only entry; add the header where browsers are absent.
  - The Stop hook needs @nolto/cli >= 0.2.0 on PATH.

Note: Cursor exposes the tools as mcp_nolto_<tool> (e.g. mcp_nolto_register_plan).
EONOTE
