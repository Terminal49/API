from __future__ import annotations

import json
from pathlib import Path
import unittest

from tools.openapi_bundle import bundle_openapi


class OpenAPIBundleTest(unittest.TestCase):
    def test_bundle_matches_single_file_spec(self) -> None:
        root = Path(__file__).resolve().parents[1]
        bundled = bundle_openapi(root / "docs" / "openapi" / "index.yaml")
        single = json.loads((root / "docs" / "openapi.json").read_text())
        self.assertEqual(single, bundled)


if __name__ == "__main__":
    unittest.main()
