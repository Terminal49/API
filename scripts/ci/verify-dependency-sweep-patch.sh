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
# publish job is the trust boundary: it runs the copy stored on origin/main,
# never one taken from the artifact or from the patched tree. The agent job runs
# the copy stored at its base commit (git show), not the working-tree copy the
# agent could have edited.
#
# The patch passes only when all of these hold:
#   1. It modifies existing tracked files only (no create, delete, rename,
#      copy, mode change or binary entry) and every path is one of the five
#      npm manifest/lockfile paths named in allowed_re below.
#   2. package.json (root and workspaces): parses without duplicate keys;
#      nothing outside the four dependency sections changed (so no `version`,
#      `scripts`, `overrides`, `engines`, `workspaces`, ...); the set of
#      dependency names in each section is unchanged; the specifier of a
#      dependency on another workspace package (release-please's pins on
#      @terminal49/sdk) is unchanged; and every changed specifier keeps the
#      base specifier's style (a single plain version with the same `^`, `~` or
#      no prefix) and does not go down. So `*`, `>=0`, `4.3.6 || >=0.0.0-0`,
#      git, file, link, URL and alias specifiers are all rejected.
#   3. package-lock.json, as text: no added line introduces a tarball, git,
#      file, link or hosted-git source that the base lockfile did not already
#      contain.
#   4. package-lock.json, as a document (parsed without duplicate keys):
#      top-level fields and the set of workspace entries are unchanged;
#      workspace entries differ from base only in dependency specifiers (never
#      `version`, which release-please owns) that follow the rule in 2; every
#      `link` entry of the base lockfile is still there, unchanged, and no link
#      is added; keys of package entries look like
#      node_modules/a[/node_modules/b...] with no path traversal.
#   5. Every new or changed package entry is checked against the npm registry
#      (a lookup that fails is a failure, there is no offline mode):
#        - the package name comes from the entry's key. A `name` field is
#          accepted only when it is identical to the base entry's (the base
#          lockfile has one npm alias, for vite);
#        - `resolved` is exactly the registry tarball URL for that name and
#          version, and the registry's `dist.tarball` and `dist.integrity` for
#          that version equal `resolved` and `integrity`;
#        - a version that is new in the lockfile was published at least
#          SWEEP_MIN_AGE_DAYS (default 7) days ago. There is no exception for
#          security fixes: a fix younger than that is a manual follow-up;
#        - it does not gain an install script (per the lockfile or the
#          registry's manifest) that the base entry did not already have;
#        - `inBundle`, `bundleDependencies` and `bin` are not changed, and a
#          new entry's `bin` matches the registry manifest;
#        - its dependency sections only list what the registry manifest lists,
#          with the same ranges;
#        - a package name that is new to the lockfile must be declared as a
#          dependency by a registry manifest of another new or changed entry,
#          by a base lockfile entry that did not change, or by a workspace.
#      This is what stops a primed npm cache or a crafted lockfile from
#      substituting a package: the lockfile is trusted only where the registry
#      agrees with it.
#
# SWEEP_REPORT, when set, is a path the script writes a Markdown list of
# the workspace specifier changes, changed, new and removed packages to, built
# only from validated names and versions (safe to put in a pull request body).
# SWEEP_REGISTRY_BASE overrides the registry API base URL (tests only).
#
# Needs bash, git, grep, diff and python3 (standard library only) and network
# access to the registry. Installs nothing and runs no project code.

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
# One python call per manifest keeps this free of jq.
ws_names="$(
  for manifest in "${workspace_manifests[@]}"; do
    g cat-file blob "$base_rev:$manifest" || fail "$manifest is not readable at $base_rev."
    printf '\0'
  done | python3 -I -c '
import json, sys
names = []
for chunk in sys.stdin.buffer.read().split(b"\0")[:-1]:
    name = json.loads(chunk).get("name")
    if not isinstance(name, str) or not name:
        sys.exit("a workspace manifest has no name")
    names.append(name)
print(json.dumps(names))
'
)" || fail "A workspace manifest has no usable name at $base_rev."
ws_manifests_json="$(printf '%s\n' "${workspace_manifests[@]}" | python3 -I -c 'import json,sys; print(json.dumps(sys.stdin.read().split()))')"

# Helpers ----------------------------------------------------------------------

# Lines of $2 that are not already a line of $1, so existing entries (for
# example the workspace link entries) may stay while new ones are judged.
added_lines() {
  { diff --new-line-format='%L' --old-line-format='' --unchanged-line-format='' "$1" "$2" || [ $? -eq 1 ]; } |
    { grep -Fxvf "$1" || [ $? -eq 1 ]; }
}

# The document checks live in one python program, written out once and run
# per file ("package" or "lock"). Standard library only, isolated mode.
checker="$work/check.py"
cat > "$checker" << 'PY'
import datetime
import gzip
import json
import os
import posixpath
import re
import sys
import time
import urllib.error
import urllib.request

kind, base_file, new_file, path, ws_names_json, ws_manifests_json = sys.argv[1:7]
WS_NAMES = set(json.loads(ws_names_json))
# Workspace directories as keys of "packages": "" for the root project.
WS_KEYS = {posixpath.dirname(m) for m in json.loads(ws_manifests_json)}
SECTIONS = ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies")
# The only specifier shape the sweep may write: one plain version, optionally
# with a ^ or ~ prefix. Anything wider (ranges, `||`, `*`, `x`, tags, URLs,
# aliases) is not a version bump.
SIMPLE_SPEC = re.compile(r"^([\^~]?)(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$")
VERSION = re.compile(r"^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$")
INTEGRITY = re.compile(r"^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$")
SEGMENT = r"(?:@[A-Za-z0-9~][A-Za-z0-9._~-]*/)?[A-Za-z0-9~][A-Za-z0-9._~-]*"
PKG_NAME = re.compile(f"^{SEGMENT}$")
KEY = re.compile(r"^node_modules/(@[^/]+/)?[^/]+(/node_modules/(@[^/]+/)?[^/]+)*$")
REGISTRY = "https://registry.npmjs.org/"
REGISTRY_API = os.environ.get("SWEEP_REGISTRY_BASE", "https://registry.npmjs.org").rstrip("/")
MIN_AGE_DAYS = float(os.environ.get("SWEEP_MIN_AGE_DAYS", "7"))
REPORT = os.environ.get("SWEEP_REPORT", "")
INSTALL_HOOKS = ("preinstall", "install", "postinstall")

errors = []


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
            return json.load(handle, object_pairs_hook=no_duplicate_keys)
    except ValueError as error:
        print(f"{path}: not valid JSON ({error})")
        sys.exit(1)


def finish():
    if errors:
        for message in errors:
            print(f"{path}: {message}")
        sys.exit(1)


def spec_error(old, new):
    """Why `new` is not an acceptable replacement for `old`, or None."""
    if not isinstance(new, str) or not isinstance(old, str):
        return "not a string"
    now, was = SIMPLE_SPEC.match(new), SIMPLE_SPEC.match(old)
    if not now:
        return "not a single plain version with an optional ^ or ~ (a wider range is not a version bump)"
    if not was:
        return f"the base specifier {old!r} is not a plain version; change it by hand"
    if now.group(1) != was.group(1):
        return f"changes the range style from {old!r}"
    if tuple(map(int, now.group(2, 3, 4))) < tuple(map(int, was.group(2, 3, 4))):
        return f"goes down from {old!r}"
    if now.group(5) and not was.group(5):
        return "moves a release range onto a prerelease"
    return None


def pre(where):
    return f"{where}: " if where else ""


def check_specs(where, base_section, new_section, section):
    """Changed specifiers of one dependency section (same names on both sides)."""
    for name, spec in new_section.items():
        if base_section[name] == spec:
            continue
        if name in WS_NAMES:
            errors.append(f"{pre(where)}{section} {name} changed; release-please owns workspace pins")
            continue
        problem = spec_error(base_section[name], spec)
        if problem:
            errors.append(f"{pre(where)}{section} {name} {spec!r}: {problem}")


def check_sections(where, before, after):
    """Dependency sections: same section and name sets, only plain specifier bumps."""
    for section in SECTIONS:
        old, new = before.get(section), after.get(section)
        if (old is None) != (new is None):
            errors.append(f"{pre(where)}the section {section} was added or removed")
            continue
        if old is None:
            continue
        if not isinstance(old, dict) or not isinstance(new, dict):
            errors.append(f"{pre(where)}{section} is not an object")
            continue
        if set(old) != set(new):
            errors.append(f"{pre(where)}the set of {section} names changed")
            continue
        check_specs(where, old, new, section)


# package.json ------------------------------------------------------------------

if kind == "package":
    base, new = load(base_file), load(new_file)
    if not isinstance(base, dict) or not isinstance(new, dict):
        errors.append("not a JSON object after the patch")
        finish()
    strip = lambda doc: {k: v for k, v in doc.items() if k not in SECTIONS}
    if strip(base) != strip(new):
        errors.append("fields other than dependencies, devDependencies, optionalDependencies and peerDependencies changed")
    check_sections(None, base, new)
    finish()
    sys.exit(0)

# package-lock.json -------------------------------------------------------------


def strip_workspace(key):
    """A key without the workspace directory it may be nested under."""
    for ws in sorted(WS_KEYS, key=len, reverse=True):
        if ws and key.startswith(ws + "/"):
            return key[len(ws) + 1:]
    return key


def under_node_modules(key):
    return strip_workspace(key).startswith("node_modules/")


def key_name(key):
    """The package name a lockfile key stands for, from the key alone."""
    return key.rsplit("node_modules/", 1)[1]


def key_problem(key):
    rest = strip_workspace(key)
    if not KEY.match(rest):
        return "not of the form [<workspace>/]node_modules/<name>[/node_modules/<name>...]"
    for segment in re.split(r"(?:^|/)node_modules/", rest)[1:]:
        if not PKG_NAME.match(segment):
            return f"unusable path segment {segment!r}"
    return None


def norm_bin(value, name):
    if value is None:
        return {}
    if isinstance(value, str):
        return {name.split("/")[-1]: value}
    if isinstance(value, dict):
        return dict(value)
    return {"?": value}


def clean_path(value):
    return value[2:] if isinstance(value, str) and value.startswith("./") else value


_packuments = {}


def packument(name):
    """The registry's full document for a package, or None (and an error recorded)."""
    if name in _packuments:
        return _packuments[name]
    url = f"{REGISTRY_API}/{name.replace('/', '%2F')}"
    doc, last = None, None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "User-Agent": "terminal49-dependency-sweep-verify",
            })
            with urllib.request.urlopen(request, timeout=60) as response:
                data = response.read()
                if response.headers.get("Content-Encoding") == "gzip":
                    data = gzip.decompress(data)
            doc = json.loads(data)
            if not isinstance(doc, dict) or not isinstance(doc.get("versions"), dict):
                raise ValueError("not a package document")
            break
        except urllib.error.HTTPError as error:
            last = f"HTTP {error.code}"
            if error.code in (400, 401, 403, 404):
                break
        except (OSError, ValueError) as error:
            last = f"{type(error).__name__}: {error}"
        time.sleep(1 + attempt)
    if doc is None:
        errors.append(f"registry lookup for {name!r} failed ({last}); refusing to trust the lockfile entry")
    _packuments[name] = doc
    return doc


def declared_names(manifest):
    names = set()
    for section in ("dependencies", "optionalDependencies", "peerDependencies"):
        value = manifest.get(section)
        if isinstance(value, dict):
            names.update(value)
    return names


def check_lock():
    base_doc, new_doc = load(base_file), load(new_file)
    for label, doc in (("base", base_doc), ("patched", new_doc)):
        if not isinstance(doc, dict) or not isinstance(doc.get("packages"), dict):
            print(f"{path}: the {label} file is not an npm lockfile with a packages map")
            sys.exit(1)
    base_pkgs, new_pkgs = base_doc["packages"], new_doc["packages"]

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
        strip = lambda entry: {k: v for k, v in entry.items() if k not in SECTIONS}
        if strip(before) != strip(after):
            errors.append(f"workspace entry {key!r}: fields other than dependency sections changed (release-please owns 'version')")
        check_sections(f"workspace entry {key!r}", before, after)

    # Workspace symlinks are untouched: every base link survives as it was.
    for key, entry in base_pkgs.items():
        if isinstance(entry, dict) and "link" in entry and new_pkgs.get(key) != entry:
            errors.append(f"{key!r}: a link entry of the base lockfile was removed or changed")

    changed = []  # (key, entry, before, name)
    for key, entry in new_pkgs.items():
        if key in WS_KEYS:
            continue
        if not isinstance(entry, dict):
            errors.append(f"{key!r}: entry is not an object")
            continue
        if not under_node_modules(key):
            errors.append(f"{key!r}: a packages key outside node_modules that is not a workspace")
            continue
        problem = key_problem(key)
        if problem:
            errors.append(f"{key!r}: {problem}")
            continue
        if "link" in entry:
            if base_pkgs.get(key) != entry:
                errors.append(f"{key!r}: a link entry was added or changed")
            continue
        before = base_pkgs.get(key)
        if before == entry:
            continue
        changed.append((key, entry, before if isinstance(before, dict) else None))

    # Names that may appear as new packages: dependencies the verified registry
    # manifests declare (filled below), dependencies of base entries that did
    # not change, and dependencies of the workspaces.
    declared = set()
    for key, entry in new_pkgs.items():
        if not isinstance(entry, dict) or "link" in entry:
            continue
        if key in WS_KEYS or base_pkgs.get(key) == entry:
            declared |= declared_names(entry)

    now = datetime.datetime.now(datetime.timezone.utc)
    changed_report, new_report = [], []
    for key, entry, before in changed:
        label = repr(key)
        derived = key_name(key)
        # The name comes from the key. `name` is only an alias marker and may
        # not be introduced or changed (a base entry's own alias stays valid).
        if "name" in entry and not (before is not None and before.get("name") == entry["name"]):
            errors.append(f"{label}: a `name` field was added or changed")
            continue
        name = entry.get("name", derived)
        if not isinstance(name, str) or not PKG_NAME.match(name):
            errors.append(f"{label}: unusable package name {name!r}")
            continue
        version, resolved, integrity = entry.get("version"), entry.get("resolved"), entry.get("integrity")
        if not isinstance(version, str) or not VERSION.match(version):
            errors.append(f"{label}: missing or unusable version {version!r}")
            continue
        expected = f"{REGISTRY}{name}/-/{name.split('/')[-1]}-{version}.tgz"
        if resolved != expected:
            errors.append(f"{label}: resolved is {resolved!r}, expected the npm registry tarball {expected!r}")
        if not isinstance(integrity, str) or not INTEGRITY.match(integrity):
            errors.append(f"{label}: missing or malformed integrity")
        if entry.get("hasInstallScript") and not (before and before.get("hasInstallScript")):
            errors.append(f"{label}: newly declares an install script")
        for field in ("inBundle", "bundleDependencies", "bundledDependencies"):
            if entry.get(field) != (before or {}).get(field) or (before is None and field in entry):
                errors.append(f"{label}: `{field}` was added or changed")
        if before is not None and entry.get("bin") != before.get("bin"):
            errors.append(f"{label}: `bin` changed")

        # Registry cross-check.
        doc = packument(name)
        if doc is None:
            continue
        manifest = doc["versions"].get(version)
        if not isinstance(manifest, dict):
            errors.append(f"{label}: {name}@{version} is not published on the registry")
            continue
        dist = manifest.get("dist") if isinstance(manifest.get("dist"), dict) else {}
        if dist.get("integrity") != integrity:
            errors.append(f"{label}: integrity does not match the registry's dist.integrity for {name}@{version}")
        if dist.get("tarball") != resolved:
            errors.append(f"{label}: resolved does not match the registry's dist.tarball for {name}@{version}")

        identity_changed = before is None or any(before.get(f) != entry.get(f) for f in ("version", "resolved", "integrity"))
        published = None
        if identity_changed:
            stamp = (doc.get("time") or {}).get(version)
            try:
                published = datetime.datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
                if published.tzinfo is None:
                    published = published.replace(tzinfo=datetime.timezone.utc)
            except ValueError:
                errors.append(f"{label}: the registry has no usable publish time for {name}@{version}")
            else:
                age = (now - published).total_seconds() / 86400
                if age < MIN_AGE_DAYS:
                    errors.append(f"{label}: {name}@{version} was published {age:.1f} days ago; the minimum is {MIN_AGE_DAYS:g} days")

        scripts = manifest.get("scripts") if isinstance(manifest.get("scripts"), dict) else {}
        registry_hooks = any(hook in scripts for hook in INSTALL_HOOKS) or bool(manifest.get("gypfile")) or bool(manifest.get("hasInstallScript"))
        if registry_hooks and not (before and before.get("hasInstallScript")):
            errors.append(f"{label}: {name}@{version} has install scripts on the registry that the base entry did not have")
        elif registry_hooks and not entry.get("hasInstallScript"):
            errors.append(f"{label}: {name}@{version} has install scripts on the registry but the lockfile entry does not say so")

        for section in ("dependencies", "optionalDependencies", "peerDependencies"):
            value = entry.get(section)
            if value is None:
                continue
            allowed = {}
            sources = ("dependencies", "optionalDependencies") if section == "dependencies" else (section,)
            for source in sources:
                if isinstance(manifest.get(source), dict):
                    allowed.update(manifest[source])
            if not isinstance(value, dict):
                errors.append(f"{label}: {section} is not an object")
                continue
            for dep, spec in value.items():
                if allowed.get(dep) != spec:
                    errors.append(f"{label}: {section} {dep!r}: {spec!r} is not what the registry manifest of {name}@{version} declares")

        if before is None:
            lock_bin = {k: clean_path(v) for k, v in norm_bin(entry.get("bin"), name).items()}
            reg_bin = {k: clean_path(v) for k, v in norm_bin(manifest.get("bin"), name).items()}
            if any(reg_bin.get(k) != v for k, v in lock_bin.items()):
                errors.append(f"{label}: `bin` does not match the registry manifest of {name}@{version}")

        declared |= declared_names(manifest)
        if before is None:
            new_report.append((key, derived, name, version, published))
        elif identity_changed:
            changed_report.append((name, before.get("version"), version, published))

    for key, derived, name, version, published in new_report:
        parent = key.rsplit("/node_modules/", 1)[0] if "/node_modules/" in strip_workspace(key) else None
        if parent is not None and parent not in new_pkgs:
            errors.append(f"{key!r}: its parent {parent!r} is not in the lockfile")
        if derived not in declared:
            errors.append(f"{key!r}: the new package {derived!r} is not a dependency of any updated package, unchanged lockfile entry or workspace")

    if REPORT and not errors:
        write_report(base_pkgs, new_pkgs, changed_report, new_report)
    finish()


def fmt_time(value):
    return value.strftime("%Y-%m-%d") if value else "unknown date"


def write_report(base_pkgs, new_pkgs, changed_report, new_report):
    lines = ["### Verified lockfile changes", ""]
    specs = []
    for key in sorted(WS_KEYS):
        for section in SECTIONS:
            old, new = base_pkgs[key].get(section) or {}, new_pkgs[key].get(section) or {}
            for dep in sorted(new):
                if old.get(dep) != new[dep]:
                    specs.append(f"- `{key or '.'}` {section}: `{dep}` `{old.get(dep)}` to `{new[dep]}`")
    lines += ["Workspace specifier changes:", ""] + (specs or ["- none"]) + [""]
    lines += ["Packages updated (name, from, to, published):", ""]
    lines += [f"- `{n}` `{a}` to `{b}` ({fmt_time(p)})" for n, a, b, p in sorted(changed_report, key=lambda r: (r[0], r[2]))] or ["- none"]
    lines += ["", "New packages added to the lockfile:", ""]
    lines += [f"- `{k}` (`{n}@{v}`, published {fmt_time(p)})" for k, _d, n, v, p in sorted(new_report)] or ["- none"]
    removed = sorted(k for k in base_pkgs if k not in new_pkgs)
    lines += ["", "Lockfile entries removed:", ""] + ([f"- `{k}`" for k in removed] or ["- none"]) + [""]
    with open(REPORT, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


if kind == "lock":
    check_lock()
else:
    sys.exit(f"unknown check {kind!r}")
PY

# 2 + 3 + 4 + 5. Per file --------------------------------------------------------

check_package_json() {
  local path="$1"
  python3 -I "$checker" package "$work/base/$path" "$work/new/$path" "$path" "$ws_names" "$ws_manifests_json" ||
    fail "$path: the package.json check failed (see above)."
}

check_npm_lock() {
  local path="$1" bad

  bad="$(added_lines "$work/base/$path" "$work/new/$path" |
    { grep -E 'git\+|(^|[^A-Za-z0-9_./-])(tarball|file|link|github|gitlab|bitbucket):|codeload\.github\.com|"link": true' || [ $? -eq 1 ]; })"
  if [ -n "$bad" ]; then
    echo "Added lockfile lines with a non-registry source (escaped):"
    printf '  %q\n' "$bad"
    fail "$path: the lockfile gained a tarball, git, file or link source."
  fi

  python3 -I "$checker" lock "$work/base/$path" "$work/new/$path" "$path" "$ws_names" "$ws_manifests_json" ||
    fail "$path: package-lock.json check failed (see above)."
}

# Run the per-file checks ------------------------------------------------------

for path in "${paths[@]}"; do
  case "$path" in
    package-lock.json) check_npm_lock "$path" ;;
    package.json | */package.json) check_package_json "$path" ;;
    *) fail "No content check for $path." ;;
  esac
done

# The lockfile check writes the report; a patch without a lockfile change has none.
if [ -n "${SWEEP_REPORT:-}" ] && [ ! -e "$SWEEP_REPORT" ]; then
  printf '### Verified lockfile changes\n\nThe patch does not change package-lock.json.\n' > "$SWEEP_REPORT"
fi

echo "Patch OK: ${#paths[@]} file(s)."
printf '  %s\n' "${paths[@]}"
