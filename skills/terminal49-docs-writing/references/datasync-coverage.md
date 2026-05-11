# DataSync And Coverage Docs

Use this guide for DataSync docs, carrier/terminal coverage docs, data availability, and source matrices.

## DataSync docs

DataSync pages should be reference-grade enough for evaluation:

- List each table.
- Link to field-level schema pages.
- State data types, nullability, and refresh semantics where known.
- List supported destinations in docs, not only in external spreadsheets.
- Explain setup prerequisites without turning the page into a sales page.

Avoid naming that implies false scope. For example, do not call a general container table `containers (rail)` unless it is actually rail-only.

## Coverage docs

Coverage claims must be backed by checked-in data or a maintained public source.

Rules:

- Do not write "100+", "98%", or similar claims unless the page lists or links to the complete source.
- Prefer carrier and terminal tables with limitations.
- State when support differs by identifier type: Bill of Lading (BOL), booking, or container number.
- Keep external sheets as supplemental, not the only discoverable source.

## Availability docs

For data source availability:

- Separate supported, partially supported, coming soon, and deprecated/unavailable.
- Avoid contradictions such as "coming soon" on one page and "degraded" elsewhere.
- Include feature entitlements when availability depends on account enablement.

## Checklist

- Can a developer answer "will this cover my carrier/terminal/destination?"
- Can a data engineer map the output schema without a sales call?
- Are limitations attached to the relevant carrier, terminal, table, or field?
- Are marketing claims removed or backed by enumerated data?
