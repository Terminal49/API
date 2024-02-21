---
stoplight-id: 43gnp5d9g50ym
---

# Vessel Insights API

Vessel Intelligence is a whole new area of the Terminal49 API that brings together numerous features to give you complete context and situational awareness of your containers' ocean transportation.

At the high level it is comprised of two components:

## 1. Precise vessel location

We are gathering vessel positions for every container vessel from Terrestrial and Sattelite AIS to keep you informed of vessel positions. AIS positions are refreshed on an hourly basis. 

> This is now released in the API directly in the [Vessel Model](https://developers.terminal49.com/docs/api/9ddff2198c387-vessel).  Whenever a vessel is loaded or departs, you can use the GET Vessel endpoint to keep tracking that vessel location if you wish or you can request a vessel by it's IMO.
> 

New vessel data includes:

**latitude and longitude**

**nautical_speed_knots -** The current speed of the ship in knots (nautical miles per hour)

**navigational_heading_degrees -** The current heading of the ship in degrees, where 0 is North, 90 is East, 180 is South, and 270 is West

**position_timestamp -** The timestamp of when the ship's position was last recorded

In addition to the most recent location, you can request historical positions to plot the course of a vessel over time.

[GET /V2/vessels/{id}/positions](url)

## Container routing plan

The routing shows each port where the container changes vessel, the arrival arrival and departure vessels with ETA/ATA and ETD/ATD.

The container routing plan shows you all of the ports where your container changes vessel. You can use this in combination with the vessel positions endpoint to return both past, and future estimated events.

GET /v2/containers/{id}/route

route_location

ports_of_call