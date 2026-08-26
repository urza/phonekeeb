#!/usr/bin/env bash
# Claude Code status line: "MyProject > main > Fable 5 (max) > 42% cntx"
#
# Reads the JSON snapshot Claude Code pipes on stdin. Segments that have no data
# (not a git repo, no effort field, no usage yet) drop out instead of showing
# placeholders, so the line degrades to e.g. "MyProject > Fable 5".
#
# Reusable: copy this file anywhere and point settings.json at it:
#   "statusLine": { "type": "command", "command": "bash /path/to/statusline.sh" }
# Requires jq.

input=$(cat)

j() { printf '%s' "$input" | jq -r "$1"; }

project=$(basename "$(j '.workspace.project_dir // .cwd // "?"')")

# Branch of whatever directory the session is in - a linked worktree has its own
# checked-out branch, so this covers "worktree info" too. Detached HEAD -> short SHA.
dir=$(j '.workspace.current_dir // .workspace.project_dir // empty')
branch=""
if [ -n "$dir" ]; then
    branch=$(git -C "$dir" --no-optional-locks branch --show-current 2>/dev/null)
    [ -z "$branch" ] && branch=$(git -C "$dir" --no-optional-locks rev-parse --short HEAD 2>/dev/null)
fi

model=$(j '.model.display_name // "?"')
# Docs-confirmed shape: effort is an object, {"level":"max"}; the whole key is
# absent when the model does not support the effort parameter, so this renders
# nothing rather than an empty bracket.
effort=$(j '.effort.level // empty')
pct=$(j '.context_window.used_percentage // empty')

out="$project"
[ -n "$branch" ] && out="$out > $branch"
out="$out > $model"
[ -n "$effort" ] && out="$out ($effort)"
[ -n "$pct" ] && out=$(printf '%s > %.0f%% cntx' "$out" "$pct")
printf '%s' "$out"
