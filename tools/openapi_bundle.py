from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Tuple
import yaml


def load_yaml(source: Path) -> Any:
    """Load YAML from a file using the standard library parser."""
    with open(source, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


class BundleError(RuntimeError):
    """Raised when a referenced document cannot be resolved."""


class ValidationError(RuntimeError):
    """Raised when schema validation fails."""


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
                # Enhanced error message with helpful context
                rel_path = target_file.relative_to(current_file.parent.parent) if target_file.is_relative_to(current_file.parent.parent) else target_file
                current_rel = current_file.relative_to(current_file.parent.parent) if current_file.is_relative_to(current_file.parent.parent) else current_file

                error_msg = [
                    f"Referenced file not found: {ref}",
                    f"  Referenced from: {current_rel}",
                    f"  Looking for: {rel_path}",
                    f"  Resolved path: {target_file}",
                    f"",
                    f"💡 Tips:",
                    f"  - Check if the path is correct relative to {current_file.parent}",
                    f"  - Verify the file exists in your working directory",
                    f"  - Make sure the filename and extension match exactly (case-sensitive)",
                ]
                raise BundleError("\n".join(error_msg))
            key = (target_file, fragment)
            if key in stack:
                # Show the circular reference chain
                chain = [str(f.relative_to(current_file.parent.parent) if f.is_relative_to(current_file.parent.parent) else f) for f, _ in stack]
                chain.append(str(target_file.relative_to(current_file.parent.parent) if target_file.is_relative_to(current_file.parent.parent) else target_file))
                error_msg = [
                    f"Circular $ref detected: {ref}",
                    f"",
                    f"Reference chain:",
                ] + [f"  {i+1}. {path}" for i, path in enumerate(chain)]
                raise BundleError("\n".join(error_msg))
            data = load_yaml(target_file)
            resolved = _resolve(data, target_file, stack | {key})
            if fragment:
                fragment = fragment.lstrip("/")
                original_resolved = resolved
                parts = fragment.split("/")
                for i, part in enumerate(parts):
                    if part:
                        if isinstance(resolved, dict) and part in resolved:
                            resolved = resolved[part]
                        else:
                            # Enhanced fragment error with available keys
                            available = list(resolved.keys())[:10] if isinstance(resolved, dict) else []
                            error_msg = [
                                f"Fragment '{fragment}' not found in {ref}",
                                f"  Looking for: {part}",
                                f"  At path: {'/' + '/'.join(parts[:i]) if i > 0 else '(root)'}",
                            ]
                            if available:
                                error_msg.append(f"")
                                error_msg.append(f"Available keys at this level:")
                                for key in available:
                                    error_msg.append(f"  - {key}")
                                if len(resolved.keys()) > 10:
                                    error_msg.append(f"  ... and {len(resolved.keys()) - 10} more")
                            raise BundleError("\n".join(error_msg))
            return _resolve(resolved, target_file, stack | {key})
        normalized: Dict[str, Any] = {}
        for k, v in value.items():
            key = k if isinstance(k, str) else str(k)
            normalized[key] = _resolve(v, current_file, stack)
        return normalized
    if isinstance(value, list):
        return [_resolve(item, current_file, stack) for item in value]
    return value


def _validate_schema_file(path: Path, data: Any) -> None:
    """Validate that a schema file has the expected structure."""
    if not isinstance(data, dict):
        raise ValidationError(
            f"Schema file must be a dictionary: {path}\n"
            f"  Got: {type(data).__name__}"
        )

    # Check if it's a $ref-only file (which is valid)
    if set(data.keys()) == {"$ref"}:
        return

    # Check if it has at least one of the expected schema fields
    expected_fields = {"type", "properties", "anyOf", "oneOf", "allOf", "$ref", "enum"}
    if not any(field in data for field in expected_fields):
        error_msg = [
            f"Schema file appears to be missing expected fields: {path}",
            f"",
            f"Expected at least one of: {', '.join(sorted(expected_fields))}",
            f"Found keys: {', '.join(sorted(data.keys()))}",
            f"",
            f"💡 Tip: Schema files should define a type structure or reference another schema",
        ]
        raise ValidationError("\n".join(error_msg))


def bundle_openapi(root: Path, validate_schemas: bool = True) -> Dict[str, Any]:
    """
    Bundle a multi-file OpenAPI specification into a single document.

    Args:
        root: Path to the root OpenAPI YAML file
        validate_schemas: If True, validate schema files before bundling

    Returns:
        The bundled OpenAPI document as a dictionary

    Raises:
        BundleError: If a referenced file cannot be resolved or circular refs detected
        ValidationError: If schema validation fails
    """
    document = load_yaml(root)

    # Optionally validate schema files before bundling
    if validate_schemas:
        schemas_dir = root.parent / "components" / "schemas"
        if schemas_dir.exists():
            for schema_file in schemas_dir.glob("*.yaml"):
                try:
                    schema_data = load_yaml(schema_file)
                    _validate_schema_file(schema_file, schema_data)
                except ValidationError:
                    raise
                except Exception as e:
                    raise ValidationError(
                        f"Failed to validate schema file: {schema_file}\n"
                        f"  Error: {e}"
                    )

    return _resolve(document, root.resolve(), set())


def write_bundle(source: Path, destination: Path, validate_schemas: bool = True) -> None:
    import json

    bundled = bundle_openapi(source, validate_schemas=validate_schemas)
    destination.write_text(json.dumps(bundled, indent=2, sort_keys=False) + "\n")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Bundle a multi-file OpenAPI spec into a single JSON document",
        epilog="Example: python -m tools.openapi_bundle docs/openapi/index.yaml docs/openapi.json"
    )
    parser.add_argument("source", type=Path, help="Path to the root OpenAPI YAML file")
    parser.add_argument("destination", type=Path, help="Where to write the bundled JSON output")
    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="Skip schema validation before bundling"
    )
    args = parser.parse_args()

    try:
        write_bundle(args.source, args.destination, validate_schemas=not args.no_validate)
        print(f"✅ Successfully bundled {args.source} → {args.destination}")
    except (BundleError, ValidationError) as e:
        print(f"❌ Error: {e}", file=__import__('sys').stderr)
        exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=__import__('sys').stderr)
        exit(1)


if __name__ == "__main__":
    main()
