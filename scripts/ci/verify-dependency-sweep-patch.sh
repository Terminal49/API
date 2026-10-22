#!/usr/bin/env bash
# Verifies the patch produced by the weekly dependency sweep agent
# (.github/workflows/weekly-dependency-maintenance.yml).
#
# Usage: verify-dependency-sweep-patch.sh PATCH_FILE
#
# Run from inside the repository checkout. The checkout's HEAD (or $BASE_REV)
# is the base the patch is verified against: base file contents are read from
# git objects, never from the working tree, so the check gives the same answer
# in the agent job (dirty working tree) and the publish job (clean checkout).
# Both jobs run this one script, which is where the path allowlist lives. The
# publish job is the trust boundary: it must run this script from its own
# freshly checked-out base commit, never from the artifact. The agent job runs
# the copy stored at its base commit (git show), not the working-tree copy the
# agent could have edited.
#
# The patch passes only when all of these hold:
#   1. It modifies existing tracked files only (no create, delete, rename,
#      copy, mode change or binary entry) and every path is one of the five
#      npm manifest/lockfile paths named in allowed_re below.
#   2. package.json (root and workspaces): nothing outside the four dependency
#      sections changed (so no `version`, `scripts`, `overrides`, `engines`,
#      `workspaces`, ...), the set of dependency names in each section is
#      unchanged, the specifier of a dependency on another workspace package
#      (release-please's pins on @terminal49/sdk) is unchanged, and every
#      changed specifier is a plain semver range (no git, file, link, URL,
#      alias).
#   3. package-lock.json, as text: no added line introduces a tarball, git,
#      file, link or hosted-git source that the base lockfile did not already
#      contain.
#   4. package-lock.json, as a document: top-level fields and the set of
#      workspace entries are unchanged; workspace entries differ from base only
#      in dependency specifiers (never `version`, which release-please owns);
#      `link` entries are untouched; every new or changed package entry has a
#      `resolved` URL that is exactly the npm registry tarball URL for its
#      name and version, a well-formed `integrity` hash, no `link`, and does
#      not newly declare `hasInstallScript`.
#
# Needs bash, git, jq, diff, grep and python3. Installs nothing and runs no
# project code.

set -euo pipefail

# Whole-path match. Keep this the only copy of the allowlist. A new workspace
# must be added here and to workspace_manifests, or the sweep fails closed.
allowed_re='^(package\.json|package-lock\.json|packages/mcp/package\.json|sdks/typescript-sdk/package\.json|sdks/typescript-sdk-cli/package\.json)$'
workspace_manifests=(package.json packages/mcp/package.json sdks/typescript-sdk/package.json sdks/typescript-sdk-cli/package.json)

# The checkout may carry agent-modified .git/config; keep git from running
# helpers, hooks or textconv filters, and ignore user-configured prefixes.
g() { git --literal-pathspecs -c core.fsmonitor=false -c core.hooksPath=/dev/null "$@"; }

fail() {
  echo "::error::$*"
  exit 1
}

[ "$#" -eq 1 ] || fail "usage: $0 PATCH_FILE"
patch="$1"
base_rev="${BASE_REV:-HEAD}"

[ -f "$patch" ] && [ ! -L "$patch" ] && [ -s "$patch" ] || fail "The patch is missing, empty or not a regular file."

# Later steps run from other directories; make the patch path absolute first.
patch="$(cd "$(dirname "$patch")" && pwd -P)/$(basename "$patch")"

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

# 1. Shape and paths ----------------------------------------------------------

# Content edits of existing files print nothing here. Any file creation,
# deletion, rename, copy or mode change does.
summary="$(g apply --summary "$patch")"
if [ -n "$summary" ]; then
  echo "Patch contains creates, deletes, renames or mode changes (escaped):"
  printf '%q\n' "$summary"
  fail "The patch does more than edit existing manifests and lockfiles."
fi

# Records are "<added>\t<deleted>\t<path>", NUL separated; binary files show "-" counts.
paths=()
while IFS= read -r -d '' rec; do
  added="${rec%%$'\t'*}"
  rest="${rec#*$'\t'}"
  path="${rest#*$'\t'}"
  if [ "$added" = "-" ] || ! [[ "$path" =~ $allowed_re ]]; then
    echo "Disallowed patch entry (escaped):"
    printf '  %q\n' "$rec"
    fail "The patch touches a path outside the manifest/lockfile allowlist, or is binary."
  fi
  paths+=("$path")
done < <(g apply --numstat -z "$patch")

[ "${#paths[@]}" -gt 0 ] || fail "The patch lists no files."

# Materialise base and patched copies of just those files ----------------------

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/base" "$work/new"

for path in "${paths[@]}"; do
  mkdir -p "$work/base/$(dirname "$path")" "$work/new/$(dirname "$path")"
  g cat-file blob "$base_rev:$path" > "$work/base/$path" || fail "$path does not exist at $base_rev."
  cp "$work/base/$path" "$work/new/$path"
done

# GIT_CEILING_DIRECTORIES keeps git from discovering a repository above $work.
GIT_CEILING_DIRECTORIES="$work" git -C "$work/new" apply --whitespace=nowarn "$patch" ||
  fail "The patch does not apply to $base_rev."

# Names of the workspace packages, read from the base manifests (not the patch).
ws_names='[]'
for manifest in "${workspace_manifests[@]}"; do
  name="$(g cat-file blob "$base_rev:$manifest" | jq -r '.name // empty')" || fail "$manifest is not readable JSON at $base_rev."
  [ -n "$name" ] || fail "$manifest has no name at $base_rev."
  ws_names="$(jq -c --arg n "$name" '. + [$n]' <<< "$ws_names")"
done
ws_manifests_json="$(printf '%s\n' "${workspace_manifests[@]}" | jq -R . | jq -s -c .)"

# Helpers ----------------------------------------------------------------------

# Lines of $2 that are not already a line of $1, so existing entries (for
# example the workspace link entries) may stay while new ones are judged.
added_lines() {
  { diff --new-line-format='%L' --old-line-format='' --unchanged-line-format='' "$1" "$2" || [ $? -eq 1 ]; } |
    { grep -Fxvf "$1" || [ $? -eq 1 ]; }
}

# 2. package.json --------------------------------------------------------------

check_package_json() {
  local path="$1" base="$work/base/$1" new="$work/new/$1" out
  local strip='del(.dependencies,.devDependencies,.optionalDependencies,.peerDependencies)'

  jq -e 'type == "object"' "$new" > /dev/null || fail "$path: not a JSON object after the patch."

  if [ "$(jq -S -c "$strip" "$base")" != "$(jq -S -c "$strip" "$new")" ]; then
    fail "$path: fields other than dependencies, devDependencies, optionalDependencies and peerDependencies changed."
  fi

  # Dependency names per section may not change (no additions, removals or
  # new sections); only the specifiers may.
  out="$(jq -n -r --slurpfile b "$base" --slurpfile n "$new" '
    def names($d; $s): $d[0][$s] as $v | if ($v | type) == "object" then ($v | keys) else $v end;
    ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"][] as $s
    | select(names($b; $s) != names($n; $s))
    | $s')"
  [ -z "$out" ] || fail "$path: the set of dependency names changed in: $(echo "$out" | tr '\n' ' ')"

  # Dependencies on workspace packages are release-please's, not the sweep's.
  out="$(jq -n -r --slurpfile b "$base" --slurpfile n "$new" --argjson ws "$ws_names" '
    ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"][] as $s
    | ($n[0][$s] // {}) | to_entries[]
    | select(.key as $k | $ws | index($k))
    | select(($b[0][$s] // {})[.key] != .value)
    | "\($s) \(.key)"')"
  if [ -n "$out" ]; then
    printf '  %s\n' "${out//$'\n'/$'\n'  }"
    fail "$path: the specifier of a workspace package dependency changed; release-please owns those."
  fi

  # Changed specifiers must be plain registry semver ranges.
  out="$(jq -n -r --slurpfile b "$base" --slurpfile n "$new" '
    ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"][] as $s
    | ($n[0][$s] // {}) | to_entries[]
    | select(($b[0][$s] // {})[.key] != .value)
    | select((.value | type) != "string" or (.value | test("^[~^<>=]*[0-9*xX][0-9A-Za-z.+<>=^~*| -]*$") | not))
    | "\($s) \(.key) \(.value | tojson)"')"
  if [ -n "$out" ]; then
    echo "Changed specifiers that are not plain semver ranges:"
    printf '  %s\n' "${out//$'\n'/$'\n'  }"
    fail "$path: a changed dependency specifier is not a registry semver range."
  fi
}

# 3 + 4. package-lock.json -----------------------------------------------------

check_npm_lock() {
  local path="$1" bad

  bad="$(added_lines "$work/base/$path" "$work/new/$path" |
    { grep -E 'git\+|(^|[^A-Za-z0-9_./-])(tarball|file|link|github|gitlab|bitbucket):|codeload\.github\.com|"link": true' || [ $? -eq 1 ]; })"
  if [ -n "$bad" ]; then
    echo "Added lockfile lines with a non-registry source (escaped):"
    printf '  %q\n' "$bad"
    fail "$path: the lockfile gained a tarball, git, file or link source."
  fi

  python3 -I - "$work/base/$path" "$work/new/$path" "$path" "$ws_names" "$ws_manifests_json" << 'PY' || fail "$path: package-lock.json check failed (see above)."
import json
import posixpath
import re
import sys

base_file, new_file, path, ws_names_json, ws_manifests_json = sys.argv[1:6]
WS_NAMES = set(json.loads(ws_names_json))
# Workspace directories as keys of "packages": "" for the root project.
WS_KEYS = {posixpath.dirname(m) for m in json.loads(ws_manifests_json)}
SECTIONS = ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies")
SEMVER = re.compile(r"^[~^<>=]*[0-9*xX][0-9A-Za-z.+<>=^~*| -]*$")
INTEGRITY = re.compile(r"^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$")
PKG_NAME = re.compile(r"^(@[a-z0-9~][a-z0-9._~-]*/)?[a-z0-9~][a-z0-9._~-]*$")
REGISTRY = "https://registry.npmjs.org/"


def no_duplicate_keys(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError(f"duplicate key {key!r}")
        out[key] = value
    return out


def load(name):
    try:
        with open(name, encoding="utf-8") as handle:
            doc = json.load(handle, object_pairs_hook=no_duplicate_keys)
    except ValueError as error:
        print(f"{path}: not valid JSON ({error})")
        sys.exit(1)
    if not isinstance(doc, dict) or not isinstance(doc.get("packages"), dict):
        print(f"{path}: not an npm lockfile with a packages map")
        sys.exit(1)
    return doc


def strip_sections(entry):
    return {k: v for k, v in entry.items() if k not in SECTIONS}


def under_node_modules(key):
    return key.startswith("node_modules/") or "/node_modules/" in key


base_doc, new_doc = load(base_file), load(new_file)
base_pkgs, new_pkgs = base_doc["packages"], new_doc["packages"]
errors = []

top_base = {k: v for k, v in base_doc.items() if k != "packages"}
top_new = {k: v for k, v in new_doc.items() if k != "packages"}
if top_base != top_new:
    errors.append("top-level fields other than 'packages' changed (name, version, lockfileVersion, requires)")

# Workspace entries: same set, only dependency specifiers may differ.
for key in sorted(WS_KEYS):
    before, after = base_pkgs.get(key), new_pkgs.get(key)
    if not isinstance(before, dict) or not isinstance(after, dict):
        errors.append(f"workspace entry {key!r} is missing or not an object")
        continue
    if strip_sections(before) != strip_sections(after):
        errors.append(f"workspace entry {key!r}: fields other than dependency sections changed (release-please owns 'version')")
    for section in SECTIONS:
        old, new = before.get(section), after.get(section)
        if (old is None) != (new is None) or (old is not None and set(old) != set(new)):
            errors.append(f"workspace entry {key!r}: the set of {section} names changed")
            continue
        for name, spec in (new or {}).items():
            if old[name] == spec:
                continue
            if name in WS_NAMES:
                errors.append(f"workspace entry {key!r}: {section} {name} changed; release-please owns workspace pins")
            elif not isinstance(spec, str) or not SEMVER.match(spec):
                errors.append(f"workspace entry {key!r}: {section} {name} is not a plain semver range: {spec!r}")

for key, entry in new_pkgs.items():
    if key in WS_KEYS:
        continue
    if not isinstance(entry, dict):
        errors.append(f"{key!r}: entry is not an object")
        continue
    if not under_node_modules(key):
        errors.append(f"{key!r}: a packages key outside node_modules that is not a workspace")
        continue
    if "link" in entry:
        # Workspace symlinks are untouched: no new, changed or retargeted links.
        if base_pkgs.get(key) != entry:
            errors.append(f"{key!r}: a link entry was added or changed")
        continue
    before = base_pkgs.get(key)
    if before == entry:
        continue
    version, resolved, integrity = entry.get("version"), entry.get("resolved"), entry.get("integrity")
    name = entry.get("name") or key.rsplit("node_modules/", 1)[1]
    if not isinstance(name, str) or not PKG_NAME.match(name):
        errors.append(f"{key!r}: unusable package name {name!r}")
        continue
    if not isinstance(version, str) or not version:
        errors.append(f"{key!r}: no version")
        continue
    expected = f"{REGISTRY}{name}/-/{name.split('/')[-1]}-{version}.tgz"
    if resolved != expected:
        errors.append(f"{key!r}: resolved is {resolved!r}, expected the npm registry tarball {expected!r}")
    if not isinstance(integrity, str) or not INTEGRITY.match(integrity):
        errors.append(f"{key!r}: missing or malformed integrity")
    if entry.get("hasInstallScript") and not (isinstance(before, dict) and before.get("hasInstallScript")):
        errors.append(f"{key!r}: newly declares an install script")

if errors:
    for message in errors:
        print(f"{path}: {message}")
    sys.exit(1)
PY
}

# Run the per-file checks ------------------------------------------------------

for path in "${paths[@]}"; do
  case "$path" in
    package-lock.json) check_npm_lock "$path" ;;
    package.json | */package.json) check_package_json "$path" ;;
    *) fail "No content check for $path." ;;
  esac
done

echo "Patch OK: ${#paths[@]} file(s)."
printf '  %s\n' "${paths[@]}"
