# Quick Start Guide

## Before You Begin

You'll need a four things to get started.

1. **A Bill of Lading (BOL) number.** This is issued by your carrier. BOL numbers are found on your [bill of lading](https://en.wikipedia.org/wiki/Bill_of_lading) document. Ideally, this will be a shipment that is currently on the water or in terminal, but this is not necessary.
2. **The SCAC of the carrier that issued your bill of lading.** The Standard Carrier Alpha Code of your carrier is used to identify carriers in computer systems and in shipping documents. You can learn more about these [here](https://en.wikipedia.org/wiki/Standard_Carrier_Alpha_Code).
3. **A Terminal49 Account.** If you don't have one yet, [sign up here.](https://app.terminal49.com/register)
4. **An API key.** Sign in to your Terminal49 account and go to your [developer portal page](https://app.terminal49.com/developers) to get your API key.

## Track a Shipment

You can try this using the embedded request maker below, or using Postman.

1. Try it below. Click "Parameters" and replace YOUR_API_KEY with your API key. In the authorization header value.
2. Enter a value for the `request_number` and `scac`. The request number has to be a shipping line booking or master bill of lading number. The SCAC has to be a shipping line scac (see [our list of covered shipping lines](https://www.terminal49.com/shipping-lines/) to see valid SCACs)


```json http
{
  "method": "post",
  "url": "https://api.terminal49.com/v2/tracking_requests",
  "headers": {
    "Content-Type": "application/vnd.api+json",
    "Authorization": "Token YOUR_API_KEY"
  },
  "body": "{\r\n  \"data\": {\r\n    \"attributes\": {\r\n      \"request_type\": \"bill_of_lading\",\r\n      \"request_number\": \"\",\r\n      \"scac\": \"\"\r\n    },\r\n    \"type\": \"tracking_request\"\r\n  }\r\n}"
}
```

## Check Your Tracking Request Succeeded

At this point in the guide, you haven't yet set up a webook to receive status updates from the Terminal49 API, so you'll need to manually poll to check if the Tracking Request has succeeded or failed.


**Try it below. Click "Parameters" and replace <YOUR_API_KEY> with your API key.**


```json http
{
  "method": "get",
  "url": "https://api.terminal49.com/v2/tracking_requests",
  "headers": {
    "Content-Type": "application/vnd.api+json",
    "Authorization": "Token <YOUR_API_KEY>"
  }
}
```

<!-- theme: warning -->

> ### Tracking Request Troubleshooting
> The most common issue people encounter is that they are  entering the wrong number.
>
> Please check that you are entering the Bill of Lading number, booking number, or container number and not internal reference at your company or by your frieght forwarder. You can the number you are supplying by going to a carrier's website and using their tools to track your shipment using the request number. If this works, and if the SCAC is supported by T49, you should able to track it with us.
>
> You can always email us at support@terminal49.com if you have persistent issues.

## List your Tracked Shipments

If your tracking request was successful, you will now be able to list your tracked shipments.

**Try it below. Click "Parameters" and replace YOUR_API_KEY with your API key.**


```json http
{
  "method": "get",
  "url": "https://api.terminal49.com/v2/shipments",
  "headers": {
    "Content-Type": "application/vnd.api+json",
    "Authorization": "Token <YOUR_API_KEY>"
  }
}
```

Sometimes it may take a while for the tracking request to show up, but usually no more than a few minutes.

While waiting, try adding a few more shipments - Terminal49 is most powerful when you can see all your shipments in one place.

## List all your Tracked Containers

You can also list out all of your containers, if you'd like to track at that level.

Try it after replacing <YOUR_API_KEY> with your API key.

```json http
{
  "method": "get",
  "url": "https://api.terminal49.com/v2/containers",
  "headers": {
    "Content-Type": "application/vnd.api+json",
    "Authorization": "Token <YOUR_API_KEY>"
  }
}
```


## Listening for Updates with Webhooks

The true power of Terminal49's API is that it is asynchronous. You can register a Webhook, which is essentially a callback URL that our systems HTTP Post to when there are updates.

To try this, you will need to first set up a URL on the open web to receive POST requests. Once you have done this, you'll be able to receive status updates from containers and shipments as they happen, which means you don't need to poll us for updates; we'll notify you.

**Try it below. Click "Parameters" and replace YOUR_API_KEY with your API key.**

Once this is done, any changes to shipments and containers you're tracking will now be sent to your webhook URL as Http POST Requests.


```json http
{
  "method": "post",
  "url": "https://api.terminal49.com/v2/webhooks",
  "headers": {
    "Content-Type": "application/vnd.api+json",
    "Authorization": "Token <YOUR_API_KEY>"
  },
  "body": "{\r\n  \"data\": {\r\n    \"type\": \"webhook\",\r\n    \"attributes\": {\r\n      \"url\": \"https:\/\/webhook.site\/\",\r\n      \"active\": true,\r\n      \"events\": [\r\n        \"*\"\r\n      ]\r\n    }\r\n  }\r\n}"
}
```
