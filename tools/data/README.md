# Reviewed coverage inputs

`shipping-line-overrides.json` records reviewed changes to the historical shipping-line registry used during coverage imports. Keys must match a primary SCAC exactly; alternative SCACs do not inherit an override.

An entry can contain:

- `enabled`: boolean. `false` excludes the identity from the current roster and all derived exports.
- `access`: `public` or `account`.
- `trackingIdentifiers`: boolean values for `billOfLading`, `bookingNumber`, or `containerNumber`.

These declarations describe tracking admission and current availability. They do not change returned-data feature assessments. The importer applies them before joining fresh observations, so an observed historical carrier cannot re-enter the roster and missing observations cannot overwrite a reviewed tracking declaration.

Update this file through a reviewed change when integration availability or tracking admission changes. Keep evidence and operational configuration outside this public repository. The importer requires the file, validates its contents, and rejects unknown identities and fields.
