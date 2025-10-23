from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict

import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from tools.openapi_yaml import write_yaml


ROOT = Path(__file__).resolve().parents[1]
OPENAPI_JSON = ROOT / "docs" / "openapi.json"
OPENAPI_ROOT = ROOT / "docs" / "openapi"
PATHS_DIR = OPENAPI_ROOT / "paths"
SCHEMAS_DIR = OPENAPI_ROOT / "components" / "schemas"
SECURITY_DIR = OPENAPI_ROOT / "components" / "securitySchemes"


def _slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "root"


def _path_filename(path: str, existing: Dict[str, int]) -> str:
    base = _slugify(path.replace("{", "").replace("}", "").replace("/", "-"))
    count = existing.get(base, 0)
    existing[base] = count + 1
    if count:
        return f"{base}-{count+1}.yaml"
    return f"{base}.yaml"


def _component_filename(name: str, existing: Dict[str, int]) -> str:
    base = _slugify(name)
    count = existing.get(base, 0)
    existing[base] = count + 1
    if count:
        return f"{base}-{count+1}.yaml"
    return f"{base}.yaml"


def split() -> None:
    data = json.loads(OPENAPI_JSON.read_text())

    OPENAPI_ROOT.mkdir(parents=True, exist_ok=True)
    PATHS_DIR.mkdir(parents=True, exist_ok=True)
    SCHEMAS_DIR.mkdir(parents=True, exist_ok=True)
    SECURITY_DIR.mkdir(parents=True, exist_ok=True)

    path_files: Dict[str, str] = {}
    path_counts: Dict[str, int] = {}
    for route, definition in data.get("paths", {}).items():
        filename = _path_filename(route, path_counts)
        write_yaml(PATHS_DIR / filename, definition)
        path_files[route] = filename

    schema_files: Dict[str, str] = {}
    schema_counts: Dict[str, int] = {}
    for name, definition in data.get("components", {}).get("schemas", {}).items():
        filename = _component_filename(name, schema_counts)
        write_yaml(SCHEMAS_DIR / filename, definition)
        schema_files[name] = filename

    security_files: Dict[str, str] = {}
    security_counts: Dict[str, int] = {}
    for name, definition in data.get("components", {}).get("securitySchemes", {}).items():
        filename = _component_filename(name, security_counts)
        write_yaml(SECURITY_DIR / filename, definition)
        security_files[name] = filename

    index: Dict[str, object] = {
        "openapi": data.get("openapi"),
        "info": data.get("info"),
    }
    if data.get("servers"):
        index["servers"] = data["servers"]
    if data.get("tags"):
        index["tags"] = data["tags"]
    if data.get("security"):
        index["security"] = data["security"]
    if data.get("x-tagGroups"):
        index["x-tagGroups"] = data["x-tagGroups"]

    index_paths = {}
    for route, filename in path_files.items():
        index_paths[route] = {"$ref": f"./paths/{filename}"}
    if index_paths:
        index["paths"] = index_paths

    components: Dict[str, Dict[str, Dict[str, str]]] = {}
    if schema_files:
        components["schemas"] = {
            name: {"$ref": f"./components/schemas/{filename}"}
            for name, filename in schema_files.items()
        }
    if security_files:
        components["securitySchemes"] = {
            name: {"$ref": f"./components/securitySchemes/{filename}"}
            for name, filename in security_files.items()
        }
    if components:
        index["components"] = components

    write_yaml(OPENAPI_ROOT / "index.yaml", index)


if __name__ == "__main__":
    split()
