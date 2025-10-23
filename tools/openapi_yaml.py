from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, List, Tuple
import json


class YamlError(RuntimeError):
    """Raised when the lightweight YAML parser encounters invalid syntax."""


def _needs_quotes(value: str) -> bool:
    if value == "" or value.strip() != value:
        return True
    if value.lower() in {"null", "true", "false"}:
        return True
    if value and value[0] in "-?:[]{}#&,*!|>'\"%@`":
        return True
    return any(ch in value for ch in ":#{}[]\n\r\t")


def _format_key(key: str) -> str:
    if _needs_quotes(key):
        return json.dumps(key)
    return key


def _format_scalar(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value)
    raise TypeError(f"Unsupported scalar type: {type(value)!r}")


def dump_yaml(data: Any, indent: int = 0) -> str:
    prefix = "  " * indent
    if isinstance(data, dict):
        lines: List[str] = []
        for key, value in data.items():
            if not isinstance(key, str):
                raise TypeError("Dictionary keys must be strings")
            formatted_key = _format_key(key)
            if isinstance(value, dict):
                if value:
                    lines.append(f"{prefix}{formatted_key}:")
                    lines.append(dump_yaml(value, indent + 1))
                else:
                    lines.append(f"{prefix}{formatted_key}: {{}}")
            elif isinstance(value, list):
                if value:
                    lines.append(f"{prefix}{formatted_key}:")
                    lines.append(dump_yaml(value, indent + 1))
                else:
                    lines.append(f"{prefix}{formatted_key}: []")
            else:
                lines.append(f"{prefix}{formatted_key}: {_format_scalar(value)}")
        return "\n".join(lines) if lines else f"{prefix}{{}}"
    if isinstance(data, list):
        lines = []
        for item in data:
            if isinstance(item, (dict, list)):
                lines.append(f"{prefix}-")
                lines.append(dump_yaml(item, indent + 1))
            else:
                lines.append(f"{prefix}- {_format_scalar(item)}")
        return "\n".join(lines) if lines else f"{prefix}[]"
    return f"{prefix}{_format_scalar(data)}"


@dataclass
class _Line:
    indent: int
    content: str


def _tokenize(text: str) -> List[_Line]:
    lines: List[_Line] = []
    for raw in text.splitlines():
        if not raw.strip():
            continue
        stripped = raw.lstrip(" ")
        if not stripped or stripped.startswith("#"):
            continue
        indent = (len(raw) - len(stripped))
        if indent % 2:
            raise YamlError("Indentation must be multiples of two spaces")
        lines.append(_Line(indent // 2, stripped))
    return lines


def _parse_value(token: str) -> Any:
    if not token:
        return None
    if token == "null":
        return None
    if token == "true":
        return True
    if token == "false":
        return False
    if token == "[]":
        return []
    if token == "{}":
        return {}
    if token.startswith('"') and token.endswith('"'):
        return json.loads(token)
    try:
        if "." in token or "e" in token or "E" in token:
            return float(token)
        return int(token)
    except ValueError:
        return token


def _split_mapping_line(content: str) -> Tuple[str, str]:
    in_quotes = False
    escape = False
    for idx, ch in enumerate(content):
        if escape:
            escape = False
            continue
        if ch == '\\':
            escape = True
            continue
        if ch == '"':
            in_quotes = not in_quotes
            continue
        if ch == ':' and not in_quotes:
            return content[:idx], content[idx + 1 :]
    raise YamlError(f"Missing ':' in mapping line: {content}")


def _parse_block(lines: List[_Line], index: int, indent: int) -> Tuple[Any, int]:
    items: List[Any] = []
    mapping: dict[str, Any] = {}
    mode: str | None = None  # "list" or "map"

    while index < len(lines):
        line = lines[index]
        if line.indent < indent:
            break
        if line.indent > indent:
            raise YamlError(f"Unexpected indentation before: {line.content}")

        content = line.content
        index += 1

        if content.startswith("- ") or content == "-":
            if mode == "map":
                raise YamlError("Cannot mix list and map entries at the same level")
            mode = "list"
            if content == "-":
                value, index = _parse_block(lines, index, indent + 1)
            else:
                value = _parse_value(content[2:].strip())
            items.append(value)
            continue

        if ":" not in content:
            raise YamlError(f"Missing ':' in mapping line: {content}")
        if mode == "list":
            raise YamlError("Cannot mix list and map entries at the same level")
        mode = "map"
        key, rest = _split_mapping_line(content)
        key = key.strip()
        if key.startswith('"') and key.endswith('"'):
            key = json.loads(key)
        rest = rest.strip()
        if rest:
            value = _parse_value(rest)
        else:
            value, index = _parse_block(lines, index, indent + 1)
        mapping[key] = value

    if mode is None:
        return {}, index
    if mode == "list":
        return items, index
    return mapping, index


def load_yaml(source: Path | str) -> Any:
    if isinstance(source, Path):
        text = source.read_text()
    else:
        text = str(source)
    lines = _tokenize(text)
    value, index = _parse_block(lines, 0, 0)
    if index != len(lines):
        raise YamlError("Unexpected trailing content")
    return value


def write_yaml(path: Path, data: Any) -> None:
    path.write_text(dump_yaml(data) + "\n")
