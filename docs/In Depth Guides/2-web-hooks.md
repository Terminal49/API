# Webhooks

## Creating Webhooks
You may subscribe to events through webhooks to be alerted as to when events are triggered. 

You may subscribe to all webhooks by subscribing to `*`. Specific webhooks by specifying the full name of the event. e.g. `container.transport.vessel_arrived`. Or even all webhooks related to a specific model. E.g. `tracking_request.*`

See the webhooks [post endpoint](https://developers.terminal49.com/docs/api/b3A6MTYyMzcyMA-create-a-webhook) for details on adding a webhooks.


## Receiving Webhooks

When an event is triggered we will attempt to post to the URL you provided with the webhook.

The payload of every webhook is a `webhook_notification`. Each Webhook notification includes a `reference_object` in it's relationships which is the subject of that notification (e.g. a tracking request, or an updated container).

Please note that we expect the endpoint to return [HTTP 200 OK](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/200), [HTTP 201](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/201), [HTTP 202](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/202) or [HTTP 204](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/204). We aim to deliver all webhook notifications, so any other response, including timeout, will result in a dozen of retries.

```json json_schema
{
  "type":"object",
  "properties":{
    "data":{
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid"
        },
        "type": {
          "type": "string",
          "enum": [
            "webhook_notification"
          ]
        },
        "attributes": {
          "type": "object",
          "properties": {
            "event": {
              "type": "string"
            },
            "delivery_status": {
              "type": "string",
              "default": "pending",
              "enum": [
                "pending",
                "succeeded",
                "failed"
              ],
              "description": "Whether the notification has been delivered to the webhook endpoint"
            },
            "created_at": {
              "type": "string"
            }
          },
          "required": [
            "event",
            "delivery_status",
            "created_at"
          ]
        },
        "relationships": {
          "type": "object",
          "properties": {
            "webhook": {
              "type": "object",
              "properties": {
                "data": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string",
                      "format": "uuid"
                    },
                    "type": {
                      "type": "string",
                      "enum": [
                        "webhook"
                      ]
                    }
                  }
                }
              }
            },
            "reference_object": {
              "type": "object",
              "properties": {
                "data": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string",
                      "format": "uuid"
                    },
                    "type": {
                      "type": "string",
                      "enum": [
                        "tracking_request",
                        "estimated_event",
                        "transport_event",
                        "container_updated_event"
                      ]
                    }
                  }
                }
              }
            }
          },
          "required": [
            "webhook"
          ]
        }
      }
    },
    "included":{
      "type":"array",
      "items": {
        "anyOf": [
          {
            "type": "object",
            "title": "Webhook",
          },
          {
            "type": "object",
            "title": "Tracking Request",
          },
          {
            "type": "object",
            "title": "Transport Event",
          },
          {
            "type": "object",
            "title": "Estimated Event",
          },
          {
            "type": "object",
            "title": "Container Updated Event",
          },
          {
            "type": "object",
            "title": "Terminal",
          },
           {
            "type": "object",
            "title": "Port",
          },
          
        ]
      }
    }

  }
}
```

## Security
There are a few ways you can verify the webhooks sent by Terminal49.

Verify webhook signatures to confirm that received events are sent from Terminal49. Additionally, Terminal49 sends webhook events from a set list of IP addresses. Only trust events coming from these IP addresses.



### Webhook notification origin IP
The full list of IP addresses that webhook notifications may come from is:

```
35.222.62.171
```

### Verifying the webhook signature (optional)
When you create or get a webhook the model will include an attribute `secret`.

Whenever a webhook notification is delivered we create a signature by using the webhook `secret` as the key to generate a HMAC hex digest with SHA-256 on the body.

This signature is added as the header `X-T49-Webhook-Signature`

If you would like to verify that the webhook payload has not been tampered with by a 3rd party, then you can perform the same operation on the response body with the webhook secret and confirm that the digests match. 

Below is a basic example of how this might look in a rails application.
```ruby
class WebhooksController < ApplicationController
  def receive_tracking_request
    secret = ENV.fetch('TRACKING_REQUEST_WEBHOOK_SECRET')
    raise 'InvalidSignature' unless valid_signature?(request, secret)

    # continue processing webhook payload...

  end

  private

  def valid_signature?(request, secret)
    hmac = OpenSSL::HMAC.hexdigest('SHA256', secret, request.body.read)
    request.headers['X-T49-Webhook-Signature'] == hmac
  end
end
```

## Available Webook Events

Each `WebhookNotification` event represents some change to a model which you may be notified of.

List of Supported Events: 

Event | Description
---------|----------
 `tracking_request.succeeded` | Shipment created and linked to `TrackingRequest`
 `tracking_request.failed` | `TrackingRequest` failed and shipment was not created
 `tracking_request.awaiting_manifest` | `TrackingRequest` awaiting a manifest
 `tracking_request.tracking_stopped` | Terminal49 is no longer updating this `TrackingRequest`. \* Going live 2022-01-20
 `container.transport.empty_out` | Empty out at port of lading (origin)
 `container.transport.full_in` | Full in at port of lading 
 `container.transport.vessel_loaded` | Vessel loaded at port of lading 
 `container.transport.vessel_departed` | Vessel departed at port of lading
 `container.transport.transshipment_arrived` | Container arrived at transhipment port
 `container.transport.transshipment_discharged` | Container discharged at transhipment port
  `container.transport.transshipment_loaded` | Container loaded at transhipment port
 `container.transport.transshipment_departed` | Container departed at transhipment port
 `container.transport.vessel_arrived` | Container arrived on vessel at port of discharge (destination port)
 `container.transport.vessel_discharged` | Container discharged at port of discharge
 `container.transport.full_out` | Full out at port of discharge 
 `container.transport.empty_in` | Empty returned at destination
 `container.transport.rail_loaded` | Rail loaded
 `container.transport.rail_departed` | Rail departed
 `container.transport.rail_arrived` | Rail arrived
 `container.transport.rail_unloaded` | Rail unloaded
 `shipment.estimated.arrival` | ETA change notification (for port of discharge)
 `container.updated` | Container attribute(s) Updated (see below example)



## Webhook Notification Examples


### container.updated

The container updated event lets you know about changes to container properties at the terminal, or which terminal the container is (or will be) located at.

The `changeset` attribute on is a hash of all the properties which changed on the container.

Each changed property is the hash key. The prior value is the first item in the array, and the current value is the second item in the array. 

For example:
```
"changeset": {
  "pickup_lfd": [null, "2020-05-20 00:00:00"]
}
```
Shows that the pickup last free day has changed from not being set to May 20 2020.

The properties we show changes for are:
- fees_at_pod_terminal
- holds_at_pod_terminal
- pickup_lfd
- pickup_appointment_at
- available_for_pickup
- pod_terminal

In every case the attribute `container_updated.timestamp` tells you when we picked up the changes from the terminal.


<!--
type: tab
title: Available for pickup
-->
As container availability becomes known or changes at the POD Terminal we will send `container_updated` events with the key `available_for_pickup` in the `changeset`.
```json
{
  "data": {
    "id": "390fec9e-a093-4bc3-8318-f0eb480db58f",
    "type": "webhook_notification",
    "attributes": {
      "id": "390fec9e-a093-4bc3-8318-f0eb480db58f",
      "event": "container.updated",
      "delivery_status": "pending",
      "created_at": "2022-01-13T19:46:11Z"
    },
    "relationships": {
      "reference_object": {
        "data": {
          "id": "072a58fc-bf59-4363-b0d8-ac330a3945e6",
          "type": "container_updated_event"
        }
      },
      "webhook": {
        "data": {
          "id": "6a0286e5-400c-481a-849b-bf2d9703494d",
          "type": "webhook"
        }
      },
      "webhook_notification_logs": {
        "data": [

        ]
      }
    }
  },
  "included": [
    {
      "id": "072a58fc-bf59-4363-b0d8-ac330a3945e6",
      "type": "container_updated_event",
      "attributes": {
        "changeset": {
          "available_for_pickup": [
            false,
            true
          ]
        },
        "timestamp": "2022-01-13T19:46:11Z",
        "timezone": "America/Los_Angeles"
      },
      "relationships": {
        "container": {
          "data": {
            "id": "f5972784-e6f7-472b-aece-c115f811b3ab",
            "type": "container"
          }
        },
        "terminal": {
          "data": {
            "id": "e313d04f-9e5c-46ab-a0f2-720fc6161929",
            "type": "terminal"
          }
        }
      }
    },
    {
      "id": "f5972784-e6f7-472b-aece-c115f811b3ab",
      "type": "container",
      "attributes": {
        "number": "TRLU1766209",
        "seal_number": "c562a22aaff88b99",
        "created_at": "2022-01-13T19:46:11Z",
        "equipment_type": "dry",
        "equipment_length": 40,
        "equipment_height": "standard",
        "weight_in_lbs": 58321,
        "fees_at_pod_terminal": [

        ],
        "holds_at_pod_terminal": [

        ],
        "pickup_lfd": null,
        "pickup_appointment_at": null,
        "pod_full_out_chassis_number": null,
        "location_at_pod_terminal": null,
        "availability_known": true,
        "available_for_pickup": true,
        "pod_arrived_at": "2022-01-13T18:46:10Z",
        "pod_discharged_at": "2022-01-13T19:46:10Z",
        "final_destination_full_out_at": null,
        "pod_full_out_at": null,
        "empty_terminated_at": null
      },
      "relationships": {
        "shipment": {
          "data": {
            "id": "0072a028-8742-45f4-b8c7-a55def2b1e21",
            "type": "shipment"
          }
        },
        "pod_terminal": {
          "data": {
            "id": "e313d04f-9e5c-46ab-a0f2-720fc6161929",
            "type": "terminal"
          }
        },
        "transport_events": {
          "data": [

          ]
        },
        "raw_events": {
          "data": [

          ]
        }
      }
    },
    {
      "id": "e313d04f-9e5c-46ab-a0f2-720fc6161929",
      "type": "terminal",
      "attributes": {
        "id": "e313d04f-9e5c-46ab-a0f2-720fc6161929",
        "nickname": "SSA",
        "name": "SSA Terminal",
        "firms_code": "Z985"
      },
      "relationships": {
        "port": {
          "data": {
            "id": "c966b176-ef63-4448-a1bc-590fe15561a5",
            "type": "port"
          }
        }
      }
    },
    {
      "id": "c966b176-ef63-4448-a1bc-590fe15561a5",
      "type": "port",
      "attributes": {
        "id": "c966b176-ef63-4448-a1bc-590fe15561a5",
        "name": "Port of Oakland",
        "code": "USOAK",
        "state_abbr": "CA",
        "city": "Oakland",
        "country_code": "US",
        "time_zone": "America/Los_Angeles"
      }
    },
    {
      "id": "0072a028-8742-45f4-b8c7-a55def2b1e21",
      "type": "shipment",
      "attributes": {
        "created_at": "2022-01-13T19:46:10Z",
        "ref_numbers": [
          "REF-BFD922",
          "REF-D10A1D",
          "REF-76FF19"
        ],
        "tags": [

        ],
        "bill_of_lading_number": "TE49DB4FDD03",
        "shipping_line_scac": "MSCU",
        "shipping_line_name": "Mediterranean Shipping Company",
        "shipping_line_short_name": "MSC",
        "port_of_lading_locode": "MXZLO",
        "port_of_lading_name": "Manzanillo",
        "port_of_discharge_locode": "USOAK",
        "port_of_discharge_name": "Port of Oakland",
        "pod_vessel_name": "MSC CHANNE",
        "pod_vessel_imo": "9710438",
        "pod_voyage_number": "098N",
        "destination_locode": null,
        "destination_name": null,
        "destination_timezone": null,
        "destination_ata_at": null,
        "destination_eta_at": null,
        "pol_etd_at": null,
        "pol_atd_at": "2021-12-31T19:46:10Z",
        "pol_timezone": "America/Mexico_City",
        "pod_eta_at": "2022-01-13T15:46:10Z",
        "pod_ata_at": "2022-01-13T18:46:10Z",
        "pod_timezone": "America/Los_Angeles",
        "line_tracking_last_attempted_at": null,
        "line_tracking_last_succeeded_at": "2022-01-13T19:46:10Z",
        "line_tracking_stopped_at": null,
        "line_tracking_stopped_reason": null
      },
      "relationships": {
        "port_of_lading": {
          "data": {
            "id": "0a66d934-1447-4277-986f-8c1adaca14d9",
            "type": "port"
          }
        },
        "port_of_discharge": {
          "data": {
            "id": "c966b176-ef63-4448-a1bc-590fe15561a5",
            "type": "port"
          }
        },
        "pod_terminal": {
          "data": {
            "id": "e313d04f-9e5c-46ab-a0f2-720fc6161929",
            "type": "terminal"
          }
        },
        "destination": {
          "data": null
        },
        "destination_terminal": {
          "data": {
            "id": "19e3efc7-1e97-4bda-918c-82d3a3eddac6",
            "type": "terminal"
          }
        },
        "containers": {
          "data": [
            {
              "id": "f5972784-e6f7-472b-aece-c115f811b3ab",
              "type": "container"
            }
          ]
        }
      },
      "links": {
        "self": "/v2/shipments/0072a028-8742-45f4-b8c7-a55def2b1e21"
      }
    }
  ]
}
```

<!--
type: tab
title: POD Terminal
-->
The `pod_terminal` is a relationship of the container. When the pod_terminal changes the id is included. The terminal will be serialized in the included models.

N.B. the `container_updated_event` also has a relationship to a `terminal` which refers to where the information came from. Currently this is always the POD terminal. In the future this may be the final destination terminal or an off-dock location.
```json
{
  "data": {
    "id": "125f8f3b-4188-4dfb-ad7a-c26d285dc253",
    "type": "webhook_notification",
    "attributes": {
      "id": "125f8f3b-4188-4dfb-ad7a-c26d285dc253",
      "event": "container.updated",
      "delivery_status": "pending",
      "created_at": "2022-01-13T19:46:55Z"
    },
    "relationships": {
      "reference_object": {
        "data": {
          "id": "933731b0-4b79-4714-8ddb-c5c55ac036ea",
          "type": "container_updated_event"
        }
      },
      "webhook": {
        "data": {
          "id": "44be82c4-870b-49c9-84db-4c2902b74f10",
          "type": "webhook"
        }
      },
      "webhook_notification_logs": {
        "data": [

        ]
      }
    }
  },
  "included": [
    {
      "id": "933731b0-4b79-4714-8ddb-c5c55ac036ea",
      "type": "container_updated_event",
      "attributes": {
        "changeset": {
          "pod_terminal": [
            "70c7b121-0aad-42bb-8e3b-c2ef01847381",
            "9b4e30d8-2a47-4d6b-a724-da3551e5b324"
          ]
        },
        "timestamp": "2022-01-13T19:46:55Z",
        "timezone": "America/Los_Angeles"
      },
      "relationships": {
        "container": {
          "data": {
            "id": "bfadcd16-a459-46f7-bd2f-23fb6b4f4c79",
            "type": "container"
          }
        },
        "terminal": {
          "data": {
            "id": "70c7b121-0aad-42bb-8e3b-c2ef01847381",
            "type": "terminal"
          }
        }
      }
    },
    {
      "id": "bfadcd16-a459-46f7-bd2f-23fb6b4f4c79",
      "type": "container",
      "attributes": {
        "number": "TRLU1957205",
        "seal_number": "48b2cf71c681fcba",
        "created_at": "2022-01-13T19:46:55Z",
        "equipment_type": "dry",
        "equipment_length": 40,
        "equipment_height": "standard",
        "weight_in_lbs": 45370,
        "fees_at_pod_terminal": [

        ],
        "holds_at_pod_terminal": [

        ],
        "pickup_lfd": null,
        "pickup_appointment_at": null,
        "pod_full_out_chassis_number": null,
        "location_at_pod_terminal": null,
        "availability_known": true,
        "available_for_pickup": true,
        "pod_arrived_at": "2022-01-13T19:46:55Z",
        "pod_discharged_at": "2022-01-13T19:46:55Z",
        "final_destination_full_out_at": null,
        "pod_full_out_at": null,
        "empty_terminated_at": null
      },
      "relationships": {
        "shipment": {
          "data": {
            "id": "b30412be-bdc1-448b-9ce9-1a4ec0f5ca6f",
            "type": "shipment"
          }
        },
        "pod_terminal": {
          "data": {
            "id": "9b4e30d8-2a47-4d6b-a724-da3551e5b324",
            "type": "terminal"
          }
        },
        "transport_events": {
          "data": [

          ]
        },
        "raw_events": {
          "data": [

          ]
        }
      }
    },
    {
      "id": "9b4e30d8-2a47-4d6b-a724-da3551e5b324",
      "type": "terminal",
      "attributes": {
        "id": "9b4e30d8-2a47-4d6b-a724-da3551e5b324",
        "nickname": "STO",
        "name": "Shippers Transport Express",
        "firms_code": "STO"
      },
      "relationships": {
        "port": {
          "data": {
            "id": "86715d6d-1949-423a-89e5-0db3a12af695",
            "type": "port"
          }
        }
      }
    },
    {
      "id": "86715d6d-1949-423a-89e5-0db3a12af695",
      "type": "port",
      "attributes": {
        "id": "86715d6d-1949-423a-89e5-0db3a12af695",
        "name": "Port of Oakland",
        "code": "USOAK",
        "state_abbr": "CA",
        "city": "Oakland",
        "country_code": "US",
        "time_zone": "America/Los_Angeles"
      }
    },
    {
      "id": "70c7b121-0aad-42bb-8e3b-c2ef01847381",
      "type": "terminal",
      "attributes": {
        "id": "70c7b121-0aad-42bb-8e3b-c2ef01847381",
        "nickname": "SSA",
        "name": "SSA Terminal",
        "firms_code": "Z985"
      },
      "relationships": {
        "port": {
          "data": {
            "id": "86715d6d-1949-423a-89e5-0db3a12af695",
            "type": "port"
          }
        }
      }
    }
  ]
}
```
<!-- type: tab-end -->


### tracking_request.succeeded

```json
{
  "data": {
    "id": "a76187fc-5749-43f9-9053-cfaad9790a31",
    "type": "webhook_notification",
    "attributes": {
      "id": "a76187fc-5749-43f9-9053-cfaad9790a31",
      "event": "tracking_request.succeeded",
      "delivery_status": "pending",
      "created_at": "2020-09-11T21:25:34Z"
    },
    "relationships": {
      "reference_object": {
        "data": {
          "id": "bdeca506-9741-4ab1-a0a7-cfd1d908e923",
          "type": "tracking_request"
        }
      },
      "webhook": {
        "data": {
          "id": "914b21ce-dd7d-4c49-8503-65aba488e9a9",
          "type": "webhook"
        }
      },
      "webhook_notification_logs": {
        "data": []
      }
    }
  },
  "included": [
    {
      "id": "bdeca506-9741-4ab1-a0a7-cfd1d908e923",
      "type": "tracking_request",
      "attributes": {
        "request_number": "TE497ED1063E",
        "request_type": "bill_of_lading",
        "scac": "MSCU",
        "ref_numbers": [],
        "created_at": "2020-09-11T21:25:34Z",
        "status": "created",
        "failed_reason": null,
        "is_retrying": false,
        "retry_count": null
      },
      "relationships": {
        "tracked_object": {
          "data": {
            "id": "b5b10c0a-8d18-46da-b4c2-4e5fa790e7da",
            "type": "shipment"
          }
        }
      },
      "links": {
        "self": "/v2/tracking_requests/bdeca506-9741-4ab1-a0a7-cfd1d908e923"
      }
    },
    {
      "id": "b5b10c0a-8d18-46da-b4c2-4e5fa790e7da",
      "type": "shipment",
      "attributes": {
        "created_at": "2020-09-11T21:25:33Z",
        "bill_of_lading_number": "TE497ED1063E",
        "ref_numbers": [],
        "shipping_line_scac": "MSCU",
        "shipping_line_name": "Mediterranean Shipping Company",
        "port_of_lading_locode": "MXZLO",
        "port_of_lading_name": "Manzanillo",
        "port_of_discharge_locode": "USOAK",
        "port_of_discharge_name": "Port of Oakland",
        "pod_vessel_name": "MSC CHANNE",
        "pod_vessel_imo": "9710438",
        "pod_voyage_number": "098N",
        "destination_locode": null,
        "destination_name": null,
        "destination_timezone": null,
        "destination_ata_at": null,
        "destination_eta_at": null,
        "pol_etd_at": null,
        "pol_atd_at": "2020-08-29T21:25:33Z",
        "pol_timezone": "America/Mexico_City",
        "pod_eta_at": "2020-09-18T21:25:33Z",
        "pod_ata_at": null,
        "pod_timezone": "America/Los_Angeles"
      },
      "relationships": {
        "port_of_lading": {
          "data": {
            "id": "4384d6a5-5ccc-43b7-8d19-4a9525e74c08",
            "type": "port"
          }
        },
        "port_of_discharge": {
          "data": {
            "id": "2a765fdd-c479-4345-b71d-c4ef839952e2",
            "type": "port"
          }
        },
        "pod_terminal": {
          "data": {
            "id": "17891bc8-52da-40bf-8ff0-0247ec05faf1",
            "type": "terminal"
          }
        },
        "destination": {
          "data": null
        },
        "containers": {
          "data": [
            {
              "id": "b2fc728c-e2f5-4a99-8899-eb7b34ef22d7",
              "type": "container"
            }
          ]
        }
      },
      "links": {
        "self": "/v2/shipments/b5b10c0a-8d18-46da-b4c2-4e5fa790e7da"
      }
    },
    {
      "id": "b2fc728c-e2f5-4a99-8899-eb7b34ef22d7",
      "type": "container",
      "attributes": {
        "number": "ARDU1824900",
        "seal_number": "139F1451",
        "created_at": "2020-09-11T21:25:34Z",
        "equipment_type": "dry",
        "equipment_length": 40,
        "equipment_height": "standard",
        "weight_in_lbs": 53507,
        "fees_at_pod_terminal": [],
        "holds_at_pod_terminal": [],
        "pickup_lfd": null,
        "pickup_appointment_at": null,
        "availability_known": true,
        "available_for_pickup": false,
        "pod_arrived_at": null,
        "pod_discharged_at": null,
        "location_at_pod_terminal": null,
        "final_destination_full_out_at": null,
        "pod_full_out_at": null,
        "empty_terminated_at": null
      },
      "relationships": {
        "shipment": {
          "data": {
            "id": "b5b10c0a-8d18-46da-b4c2-4e5fa790e7da",
            "type": "shipment"
          }
        },
        "pod_terminal": {
          "data": {
            "id": "17891bc8-52da-40bf-8ff0-0247ec05faf1",
            "type": "terminal"
          }
        },
        "transport_events": {
          "data": [
            {
              "id": "56078596-5293-4c84-9245-cca00a787265",
              "type": "transport_event"
            }
          ]
        }
      }
    },
    {
      "id": "56078596-5293-4c84-9245-cca00a787265",
      "type": "transport_event",
      "attributes": {
        "event": "container.transport.vessel_departed",
        "created_at": "2020-09-11T21:25:34Z",
        "voyage_number": null,
        "timestamp": "2020-08-29T21:25:33Z",
        "location_locode": "MXZLO",
        "timezone": "America/Los_Angeles"
      },
      "relationships": {
        "shipment": {
          "data": {
            "id": "b5b10c0a-8d18-46da-b4c2-4e5fa790e7da",
            "type": "shipment"
          }
        },
        "container": {
          "data": {
            "id": "b2fc728c-e2f5-4a99-8899-eb7b34ef22d7",
            "type": "container"
          }
        },
        "vessel": {
          "data": null
        },
        "location": {
          "data": {
            "id": "2a765fdd-c479-4345-b71d-c4ef839952e2",
            "type": "port"
          }
        },
        "terminal": {
          "data": null
        }
      }
    }
  ]
}
```

### shipment.estimated.arrival

```json
{
  "data": {
    "id": "6f67d3f5-5e14-414e-aa7b-c1eee0f2d4fb",
    "type": "webhook_notification",
    "attributes": {
      "id": "6f67d3f5-5e14-414e-aa7b-c1eee0f2d4fb",
      "event": "shipment.estimated.arrival",
      "delivery_status": "pending",
      "created_at": "2022-01-13T19:51:02Z"
    },
    "relationships": {
      "reference_object": {
        "data": {
          "id": "7645222b-e6b0-44be-92bf-55d8babf30e4",
          "type": "estimated_event"
        }
      },
      "webhook": {
        "data": {
          "id": "a39ea379-12c8-46e3-8555-cd932ec85d14",
          "type": "webhook"
        }
      },
      "webhook_notification_logs": {
        "data": [

        ]
      }
    }
  },
  "included": [
    {
      "id": "7645222b-e6b0-44be-92bf-55d8babf30e4",
      "type": "estimated_event",
      "attributes": {
        "created_at": "2022-01-13T19:51:01Z",
        "estimated_timestamp": "2022-01-16T19:51:01Z",
        "voyage_number": "098N",
        "event": "shipment.estimated.arrival",
        "location_locode": "USOAK",
        "timezone": "America/Los_Angeles"
      },
      "relationships": {
        "shipment": {
          "data": {
            "id": "51901278-31a1-4262-8498-4c7a99f4b34a",
            "type": "shipment"
          }
        },
        "port": {
          "data": {
            "id": "bf8c78f1-1c2d-474e-a896-04e0d70df0cb",
            "type": "port"
          }
        },
        "vessel": {
          "data": {
            "id": "58b382d4-11de-4606-bfbd-d23330981dd8",
            "type": "vessel"
          }
        }
      }
    },
    {
      "id": "bf8c78f1-1c2d-474e-a896-04e0d70df0cb",
      "type": "port",
      "attributes": {
        "id": "bf8c78f1-1c2d-474e-a896-04e0d70df0cb",
        "name": "Port of Oakland",
        "code": "USOAK",
        "state_abbr": "CA",
        "city": "Oakland",
        "country_code": "US",
        "time_zone": "America/Los_Angeles"
      }
    },
    {
      "id": "51901278-31a1-4262-8498-4c7a99f4b34a",
      "type": "shipment",
      "attributes": {
        "created_at": "2022-01-13T19:51:01Z",
        "ref_numbers": [
          "REF-8FDA75"
        ],
        "tags": [

        ],
        "bill_of_lading_number": "TE49344931C0",
        "shipping_line_scac": "MSCU",
        "shipping_line_name": "Mediterranean Shipping Company",
        "shipping_line_short_name": "MSC",
        "port_of_lading_locode": "MXZLO",
        "port_of_lading_name": "Manzanillo",
        "port_of_discharge_locode": "USOAK",
        "port_of_discharge_name": "Port of Oakland",
        "pod_vessel_name": "MSC CHANNE",
        "pod_vessel_imo": "9710438",
        "pod_voyage_number": "098N",
        "destination_locode": null,
        "destination_name": null,
        "destination_timezone": null,
        "destination_ata_at": null,
        "destination_eta_at": null,
        "pol_etd_at": null,
        "pol_atd_at": "2021-12-31T19:51:01Z",
        "pol_timezone": "America/Mexico_City",
        "pod_eta_at": "2022-01-16T19:51:01Z",
        "pod_ata_at": null,
        "pod_timezone": "America/Los_Angeles",
        "line_tracking_last_attempted_at": null,
        "line_tracking_last_succeeded_at": "2022-01-13T19:51:01Z",
        "line_tracking_stopped_at": null,
        "line_tracking_stopped_reason": null
      },
      "relationships": {
        "port_of_lading": {
          "data": {
            "id": "c0991754-7fd2-4ad4-af4b-dd78645fb180",
            "type": "port"
          }
        },
        "port_of_discharge": {
          "data": {
            "id": "bf8c78f1-1c2d-474e-a896-04e0d70df0cb",
            "type": "port"
          }
        },
        "pod_terminal": {
          "data": {
            "id": "81504274-cd08-4c69-84bd-9eebe4b142e2",
            "type": "terminal"
          }
        },
        "destination": {
          "data": null
        },
        "destination_terminal": {
          "data": {
            "id": "4bbce50d-dbee-4be0-87fe-8c2cd1b7e64c",
            "type": "terminal"
          }
        },
        "containers": {
          "data": [

          ]
        }
      },
      "links": {
        "self": "/v2/shipments/51901278-31a1-4262-8498-4c7a99f4b34a"
      }
    },
    {
      "id": "58b382d4-11de-4606-bfbd-d23330981dd8",
      "type": "vessel",
      "attributes": {
        "name": "MSC CHANNE",
        "imo": "9710438",
        "mmsi": "255805864"
      }
    }
  ]
}
```

### container.transport.vessel_arrived

```json
{
  "data": {
    "id": "1df77756-572d-41a0-a6f7-d4b4b3b0dc41",
    "type": "webhook_notification",
    "attributes": {
      "id": "1df77756-572d-41a0-a6f7-d4b4b3b0dc41",
      "event": "container.transport.vessel_arrived",
      "delivery_status": "pending",
      "created_at": "2022-01-13T19:53:39Z"
    },
    "relationships": {
      "reference_object": {
        "data": {
          "id": "ee4efc1c-f410-4655-987f-97432969a579",
          "type": "transport_event"
        }
      },
      "webhook": {
        "data": {
          "id": "c0f000fe-71e9-40cc-bc94-827867e1e550",
          "type": "webhook"
        }
      },
      "webhook_notification_logs": {
        "data": [

        ]
      }
    }
  },
  "included": [
    {
      "id": "ee4efc1c-f410-4655-987f-97432969a579",
      "type": "transport_event",
      "attributes": {
        "event": "container.transport.vessel_arrived",
        "created_at": "2022-01-13T19:53:38Z",
        "voyage_number": null,
        "timestamp": "2022-01-13T19:53:38Z",
        "location_locode": "USOAK",
        "timezone": "America/Los_Angeles"
      },
      "relationships": {
        "shipment": {
          "data": {
            "id": "de5f51d5-f324-413c-967a-fe390ffcbcba",
            "type": "shipment"
          }
        },
        "container": {
          "data": {
            "id": "69a44f2e-d1da-4c7c-b7e6-899ef4d05df3",
            "type": "container"
          }
        },
        "vessel": {
          "data": {
            "id": "cbaf97a8-efd1-4f80-b012-a04917d22f3a",
            "type": "vessel"
          }
        },
        "location": {
          "data": {
            "id": "e7a09d30-89ea-4c16-9c03-4af94e05d0a5",
            "type": "port"
          }
        },
        "terminal": {
          "data": {
            "id": "ac5bb6e7-4004-4bb9-984f-0b1c9a74be21",
            "type": "terminal"
          }
        }
      }
    },
    {
      "id": "69a44f2e-d1da-4c7c-b7e6-899ef4d05df3",
      "type": "container",
      "attributes": {
        "number": "EITU1886509",
        "seal_number": "06ae7501dab385aa",
        "created_at": "2022-01-13T19:53:39Z",
        "equipment_type": "dry",
        "equipment_length": 40,
        "equipment_height": "standard",
        "weight_in_lbs": 55660,
        "fees_at_pod_terminal": [

        ],
        "holds_at_pod_terminal": [

        ],
        "pickup_lfd": null,
        "pickup_appointment_at": null,
        "pod_full_out_chassis_number": null,
        "location_at_pod_terminal": null,
        "availability_known": true,
        "available_for_pickup": false,
        "pod_arrived_at": "2022-01-13T19:53:38Z",
        "pod_discharged_at": "2022-01-13T19:53:38Z",
        "final_destination_full_out_at": "2022-01-13T19:53:38Z",
        "pod_full_out_at": null,
        "empty_terminated_at": null
      },
      "relationships": {
        "shipment": {
          "data": {
            "id": "de5f51d5-f324-413c-967a-fe390ffcbcba",
            "type": "shipment"
          }
        },
        "pod_terminal": {
          "data": null
        },
        "transport_events": {
          "data": [
            {
              "id": "ee4efc1c-f410-4655-987f-97432969a579",
              "type": "transport_event"
            }
          ]
        },
        "raw_events": {
          "data": [

          ]
        }
      }
    },
    {
      "id": "e7a09d30-89ea-4c16-9c03-4af94e05d0a5",
      "type": "port",
      "attributes": {
        "id": "e7a09d30-89ea-4c16-9c03-4af94e05d0a5",
        "name": "Port of Oakland",
        "code": "USOAK",
        "state_abbr": "CA",
        "city": "Oakland",
        "country_code": "US",
        "time_zone": "America/Los_Angeles"
      }
    },
    {
      "id": "de5f51d5-f324-413c-967a-fe390ffcbcba",
      "type": "shipment",
      "attributes": {
        "created_at": "2022-01-13T19:53:38Z",
        "ref_numbers": [
          "REF-6650D4",
          "REF-C9DCC8"
        ],
        "tags": [

        ],
        "bill_of_lading_number": "TE4922989A09",
        "shipping_line_scac": "MSCU",
        "shipping_line_name": "Mediterranean Shipping Company",
        "shipping_line_short_name": "MSC",
        "port_of_lading_locode": "MXZLO",
        "port_of_lading_name": "Manzanillo",
        "port_of_discharge_locode": "USOAK",
        "port_of_discharge_name": "Port of Oakland",
        "pod_vessel_name": "MSC CHANNE",
        "pod_vessel_imo": "9710438",
        "pod_voyage_number": "098N",
        "destination_locode": null,
        "destination_name": null,
        "destination_timezone": null,
        "destination_ata_at": null,
        "destination_eta_at": null,
        "pol_etd_at": null,
        "pol_atd_at": "2021-12-31T19:53:38Z",
        "pol_timezone": "America/Mexico_City",
        "pod_eta_at": "2022-01-20T19:53:38Z",
        "pod_ata_at": "2022-01-20T20:53:38Z",
        "pod_timezone": "America/Los_Angeles",
        "line_tracking_last_attempted_at": null,
        "line_tracking_last_succeeded_at": "2022-01-13T19:53:38Z",
        "line_tracking_stopped_at": null,
        "line_tracking_stopped_reason": null
      },
      "relationships": {
        "port_of_lading": {
          "data": {
            "id": "6dc77d28-83bc-4826-a42d-af6808797607",
            "type": "port"
          }
        },
        "port_of_discharge": {
          "data": {
            "id": "e7a09d30-89ea-4c16-9c03-4af94e05d0a5",
            "type": "port"
          }
        },
        "pod_terminal": {
          "data": {
            "id": "ac5bb6e7-4004-4bb9-984f-0b1c9a74be21",
            "type": "terminal"
          }
        },
        "destination": {
          "data": null
        },
        "destination_terminal": {
          "data": {
            "id": "4b10d3ef-901a-40db-a622-cb033ccef282",
            "type": "terminal"
          }
        },
        "containers": {
          "data": [
            {
              "id": "69a44f2e-d1da-4c7c-b7e6-899ef4d05df3",
              "type": "container"
            }
          ]
        }
      },
      "links": {
        "self": "/v2/shipments/de5f51d5-f324-413c-967a-fe390ffcbcba"
      }
    },
    {
      "id": "ac5bb6e7-4004-4bb9-984f-0b1c9a74be21",
      "type": "terminal",
      "attributes": {
        "id": "ac5bb6e7-4004-4bb9-984f-0b1c9a74be21",
        "nickname": "SSA",
        "name": "SSA Terminal",
        "firms_code": "Z985"
      },
      "relationships": {
        "port": {
          "data": {
            "id": "e7a09d30-89ea-4c16-9c03-4af94e05d0a5",
            "type": "port"
          }
        }
      }
    },
    {
      "id": "cbaf97a8-efd1-4f80-b012-a04917d22f3a",
      "type": "vessel",
      "attributes": {
        "name": "MSC CHANNE",
        "imo": "9710438",
        "mmsi": "255805864"
      }
    }
  ]
}
```
