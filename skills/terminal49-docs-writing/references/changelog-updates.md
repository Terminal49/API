# Changelog, Updates, And Release Notes

Use this guide for `docs/updates/**`, changelog entries, release announcements, and migration/deprecation notes.

## Reader job

The reader wants to know what changed, whether action is required, and where to find the details.

## Required shape

1. Date of change.
2. Short title.
3. What changed.
4. Who is affected.
5. Required action, if any.
6. Links to reference or migration docs.

## Tone

Be specific and operational:

- "Added `container.pickup_lfd_rail.changed` to webhook subscriptions."
- "No action required."
- "Update webhook allowlists before..."
- "Deprecated; no sunset date is currently documented."

Avoid:

- Launch hype.
- Unclear phrases like "improved experience."
- Silent breaking changes.
- Stale incident wording without resolution status.

## Deprecations

Every deprecation should include:

- Deprecated field, endpoint, enum, or behavior.
- Replacement.
- Sunset date, or "No sunset date is currently documented."
- Migration steps.
- Expected error or warning behavior after sunset, if known.

## Incident or degradation notes

Every incident/degradation note should include:

- Status: investigating, degraded, resolved, or monitoring.
- Start date and resolution date if resolved.
- Affected APIs/events/data sources.
- Customer action or workaround.

## Checklist

- Can readers tell if they need to act?
- Are links canonical `/docs/...` links?
- Does the update contradict current reference pages?
- Are old alarming notices resolved or removed?
