# Tracking Request Retrying

When you submit a tracking request your request is added to our queue to being checked at the shipping line. So what happens if the request doesn't go through correctly?

If we are having difficulty connecting to the shipping line, or if we are unable to parse the response from the shipping line, we will keep retrying up to 14 times.

This process can take up to approximately 24 hours. You will not receive a `tracking_request.failed` webhook notification until we have exhausted the retries, and the `status` field will not be changed to `failed` until then.

## Request Number Not Found

If the shipping line returns a response that it cannot find the provided number we either immediately fail the tracking request or keep trying depending on whether the request_type is a bill of lading or a booking number:

 * **Bill of lading numbers** fail straight away after a not found response from the shipping line. We change the `status` field to `failed` and send the `tracking_request.failed` event to your webhook.
 * **Booking numbers** do not fail instantly. We change the `status` to `awaiting_manifest` and will keep checking your request daily. You will receive a `tracking_request.awaiting_manifest` webhook notification the first time it happens. If your request number cannot be found after 7 days we will mark the tracking request as failed by changing the `status` field `failed` and sending the `tracking_request.failed` event to your webhook.

## Failed Reason

### Temporary 

The `failed_reason` field can take one of the following temporary values:

 * `unrecognized_response` when we could not parse the response from the shipping line, 
 * `shipping_line_unreachable` if the shipping line was unreachable,
 * `internal_processing_error` when we faced other issue,
 * `not_found` if the shipping line could not find the number.

### Permanent

Temporary reasons can become permanent when the `status` changes to `failed`:

 * `duplicate` when the shipment already existed,  
 * `expired` when the tracking request was created more than 7 days ago and still not succeded,
 * `retries_exhausted` if we tried for 14 times to no avail,
 * `not_found` if the shipping line could not find the number.

## Status

If you want to see the status of your tracking request you can make a [GET request](https://developers.terminal49.com/docs/api/docs/reference/terminal49/terminal49.v1.json/paths/~1tracking_requests~1%7Bid%7D/get) on what the most recent failure reason was (`failed_reason` field).
