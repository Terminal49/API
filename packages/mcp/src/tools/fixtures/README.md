# POD deadline contract fixtures

`pod-deadline-contract.json` contains synthetic JSON:API response projections with invented identifiers and dates. It is not captured production data.

The field nesting and account-visible POD values were checked against `V2::ContainerSerializer#import_deadlines` and its `smart_lfd import_deadlines` serializer examples on October 6, 2026. The fixture covers reported facility selection, an opted-in calculated selection, a withheld carrier source with a visible facility source, and unknown sources. The serializer chooses the visible `pod.unified.current_value` and its `current_selection`; consumers must not independently choose a line, facility, rail or legacy value.

The test sends these same checked-in responses through the tool and resource. This guards client interpretation of the serializer contract; it does not prove the live deployment returns this contract or execute account-entitlement logic on the backend.
