# Reviewed terminal capabilities

`terminal-capabilities.json` records reviewed capabilities independently of traffic observations. Each key is the port UN/LOCODE followed by the verified SMDG terminal code, separated by a colon. Each record contains a `features` map using keys and statuses from the terminal coverage catalog.

During a Hex import, these declarations override the observed classification for the specified features. A low-volume observation window can miss an implemented capability. Features without a declaration retain the imported classification; a missing declaration does not mean unsupported.

Update declarations through a reviewed pull request after checking the integration implementation, active configuration, and source attribution. Preserve evidence in the internal review process. Do not add private implementation details or customer data to this public file.

The generator rejects malformed identifiers, unknown feature keys, and invalid statuses. Tests also check that canonical coverage agrees with the reviewed declarations. Terminal names and legacy source codes are not capability identifiers.
