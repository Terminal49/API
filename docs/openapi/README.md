# OpenAPI authoring workflow

This repository maintains the API reference as a modular OpenAPI 3.0 specification.  The
single `docs/openapi.json` file that Mintlify consumes is generated from the YAML sources in
this folder.

## Directory layout

```
docs/openapi/
├── index.yaml              # Root document with info, servers, tags, shared components
├── paths/                  # One file per REST endpoint (you can create sub-folders)
├── components/
│   ├── schemas/            # Reusable schema definitions referenced from the paths
│   └── securitySchemes/    # Authentication descriptions
└── README.md               # You are here
```

All references between files use relative `$ref` pointers (for example,
`$ref: ../components/schemas/shipment.yaml`).  Feel free to group related paths inside
subdirectories – the bundler resolves file references relative to where they are declared.

## Editing workflow

1. Update the relevant YAML file(s) under `docs/openapi/`.
2. Regenerate the bundled JSON and check the diff:
   ```bash
   python -m tools.openapi_bundle docs/openapi/index.yaml docs/openapi.json
   ```
3. Run the regression test to ensure the bundle matches the checked-in artifact:
   ```bash
   python -m unittest tests.test_openapi_bundle
   ```
4. Commit both the YAML sources and the regenerated `docs/openapi.json`.

If you need to re-split a monolithic OpenAPI document, the helper script below reproduces the
current tree from `docs/openapi.json`:

```bash
python scripts/split_openapi.py
```

## Linting and validation

We use [Spectral](https://github.com/stoplightio/spectral) with the shared ruleset defined in
`.spectral.mjs` to lint the spec.  You can lint locally with:

```bash
npx -y @stoplight/spectral-cli lint docs/openapi/index.yaml
```

> Tip: install `@stoplight/spectral-cli` globally if you run the lint frequently.

## Continuous integration

A GitHub Actions workflow (`.github/workflows/openapi-validation.yml`) runs on every pull
request that touches the OpenAPI sources.  It lints the modular spec with Spectral and executes
`python -m unittest tests.test_openapi_bundle` to confirm the bundled JSON stays in sync.  If
you push commits that break the lint or forget to regenerate `docs/openapi.json`, the workflow
will fail and point at the offending step.

## Related files

- `tools/openapi_bundle.py` – Bundler CLI used by both local developers and CI.
- `tools/openapi_yaml.py` – Minimal YAML reader/writer used by the bundler and split script.
- `tests/test_openapi_bundle.py` – Regression test that compares the bundled JSON to the
  committed artifact.
- `.spectral.mjs` – Spectral configuration shared by local runs and CI.

