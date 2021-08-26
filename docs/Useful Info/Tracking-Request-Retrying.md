# Tracking Request Retrying

When you submit a tracking request your request is added to our queue to being checked at the shipping line. So what happens if the request doesn't go through correctly?

If we are having difficulty connecting to the shipping line, or if we are unable to parse the response from the shipping line, we will keep retrying up to 14 times.

This process can take up to approximately 24 hours. You will not receive a `tracking_request.failed` webhook notification until we have exhausted the retries, and the `status` field will not be changed to `failed` until then.

If the shipping line returns a response that it cannot find the provided bill of lading number then we will immediately return the `tracking_request.failed` event to your webhook.

However, if it's a booking tracking request and the shipping line returns a response that it cannot find the provided booking number then we will change the `status` field to `awaiting_manifest`, remove the tracking request from the queue and try again in 6 hours. You will receive a `tracking_request.awaiting_manifest` webhook notification the first time it happens. We will keep re-queing for 7 days, then mark the tracking request as `failed` and send the `tracking_request.failed` event to your webhook.

If you want to see the status of your tracking request you can make a [GET request](https://developers.terminal49.com/docs/api/docs/reference/terminal49/terminal49.v1.json/paths/~1tracking_requests~1%7Bid%7D/get) on what the most recent failure reason was (`failed_reason` field).
