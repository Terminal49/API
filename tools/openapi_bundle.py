from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Tuple

from .openapi_yaml import load_yaml


class BundleError(RuntimeError):
    """Raised when a referenced document cannot be resolved."""


def _split_ref(ref: str) -> Tuple[str, str | None]:
    if "#" in ref:
        path, fragment = ref.split("#", 1)
        return path, fragment or None
    return ref, None


def _resolve(value: Any, current_file: Path, stack: set[Tuple[Path, str | None]]) -> Any:
    if isinstance(value, dict):
        if set(value.keys()) == {"$ref"}:
            ref = value["$ref"]
            if not ref or ref.startswith("#") or "://" in ref:
                return value
            target_path, fragment = _split_ref(ref)
            target_file = (current_file.parent / target_path).resolve()
            if not target_file.exists():
                raise BundleError(f"Referenced file not found: {ref} from {current_file}")
            key = (target_file, fragment)
            if key in stack:
                raise BundleError(f"Circular $ref detected for {ref}")
            data = load_yaml(target_file)
            resolved = _resolve(data, target_file, stack | {key})
            if fragment:
                fragment = fragment.lstrip("/")
                for part in fragment.split("/"):
                    if part:
                        if isinstance(resolved, dict) and part in resolved:
                            resolved = resolved[part]
                        else:
                            raise BundleError(f"Fragment '{fragment}' not found in {ref}")
            return _resolve(resolved, target_file, stack | {key})
        return {k: _resolve(v, current_file, stack) for k, v in value.items()}
    if isinstance(value, list):
        return [_resolve(item, current_file, stack) for item in value]
    return value


def bundle_openapi(root: Path) -> Dict[str, Any]:
    document = load_yaml(root)
    return _resolve(document, root.resolve(), set())


def write_bundle(source: Path, destination: Path) -> None:
    import json

    bundled = bundle_openapi(source)
    destination.write_text(json.dumps(bundled, indent=2, sort_keys=False) + "\n")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Bundle a multi-file OpenAPI spec into a single JSON document")
    parser.add_argument("source", type=Path, help="Path to the root OpenAPI YAML file")
    parser.add_argument("destination", type=Path, help="Where to write the bundled JSON output")
    args = parser.parse_args()

    write_bundle(args.source, args.destination)


if __name__ == "__main__":
    main()
