#!/bin/bash
# Assemble the changed Design System files under <sync dir>/stage/project from
# the repo copy in <sync dir>/repo.
# usage: assemble.sh <sync dir> <published project dir> [Comp...]
#   <sync dir>               the work folder: repo/ (a copy of this repo), out-cur/, stage/
#   <published project dir>  a read-back copy of the artifact's project/ folder
#   Comp...                  the components whose stories changed (default: the 3D select parts)
set -e
S=$(cd "$1" && pwd)
P=$(cd "$2" && pwd)
shift 2
CHANGED="${*:-ShowcaseStage Showcase CharacterTile Roster SelectLayout}"
TOOLS=$(cd "$(dirname "$0")" && pwd)
cd "$S/repo/packages/ui" && rm -rf dist src/bundle-entry.js src/components/*/previews && npx vite build > "$S/build-repo.log" 2>&1
cd "$TOOLS"
rm -rf "$S/out-cur" && node gen.mjs "$S/repo" "$S/out-cur" bundle && node gen.mjs "$S/repo" "$S/out-cur" stories $CHANGED
mkdir -p "$S/stage/project/components"
cp "$S/out-cur/bundle.js" "$S/stage/project/components/bundle.js"
python3 css.py "$S/repo/packages/ui/dist/styles.css" "$S/stage/project/components/bundle.css"
for c in $CHANGED; do mkdir -p "$S/stage/project/components/$c"; cp "$S/out-cur/$c/stories.js" "$S/stage/project/components/$c/"; done
python3 docs.py "$P" "$S/repo" "$S/stage/project" "$S/heights.json"
