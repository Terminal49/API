# Tracking Request Lifecycle

When you submit a tracking request your request is added to our queue to being checked at the shipping line. So what happens if the request doesn't go through correctly?

If we are having difficulty connecting to the shipping line, or if we are unable to parse the response from the shipping line, we will keep retrying up to 14 times.

This process can take up to approximately 24 hours. You will not receive a `tracking_request.failed` webhook notification until we have exhausted the retries, and the `status` field will not be changed to `failed` until then.

## Request Number Not Found / Awaiting Manifest

If the shipping line returns a response that it cannot find the provided number we either immediately fail the tracking request or keep trying depending on whether the `request_type` is a container or not:

 * **Containers** fail straight away after a not found response from the shipping line.
 * **Bill of lading** and **booking numbers** do not fail instantly. We change the `status` to `awaiting_manifest` and will keep checking your request daily. You will receive a `tracking_request.awaiting_manifest` webhook notification the first time it happens. If your request number cannot be found after 7 days we will mark the tracking request as failed by changing the `status` field `failed` and sending the `tracking_request.failed` event to your webhook.
 * Should you wish to adjust the duration before marking your tracking requests as failed, please contact us through support@terminal49.com.
 * **Incorrect request number type** if the request number type (ex. booking number) is incorrect, the tracking request will still fail even though the request number is correct.


## Failed Reason

### Temporary

The `failed_reason` field can take one of the following temporary values:

 * `unrecognized_response` when we could not parse the response from the shipping line,
 * `shipping_line_unreachable` if the shipping line was unreachable,
 * `internal_processing_error` when we faced other issue,
 * `awaiting_manifest` if the shipping line indidicates a bill of lading number is found, but data is not yet available, or if the requested number could not be found.

### Permanent

Temporary reasons can become permanent when the `status` changes to `failed`:

 * `duplicate` when the shipment already existed,
 * `expired` when the tracking request was created more than 7 days ago and still not succeded,
 * `retries_exhausted` if we tried for 14 times to no avail,
 * `not_found` if the shipping line could not find the BL number.
 * `invalid_number` if the shipping line rejects the formatting of the number.
 * `booking_cancelled` if the shipping line indicates that the booking has been cancelled.
 * `data_unavailable` if the number is valid but the shipping line will not provide the data. Examples include shipments that are flagged as private or results that are removed due to data retention policies.

[Failed Reasons when tracking request through dashboard](https://help.terminal49.com/en/articles/6116676-what-happens-after-i-add-a-shipment-to-terminal49-recently-added-shipments#h_ac9b93504f)

## Stopped

When a shipment is no longer being updated then the tracking request `status` is marked as `tracking_stopped`.

You may subscribe to the event `tracking_request.tracking_stopped` for notifications when this occurs.

Terminal49 will stop tracking requests for the following reasons:

 * The booking was cancelled.
 * The data is no longer available at the shipping line.
 * All shipment containers are marked `empty_returned`.
 * More than 56 days have passed since the shipment arrived at it's destination.
 * There have been no updates from the shipping line for more than 56 days.

 In addition end-users may stop tracking a shipment through the dashboard.

## Retrieving Status

If you want to see the status of your tracking request you can make a [GET request](https://developers.terminal49.com/docs/api/docs/reference/terminal49/terminal49.v1.json/paths/~1tracking_requests~1%7Bid%7D/get) on what the most recent failure reason was (`failed_reason` field).
