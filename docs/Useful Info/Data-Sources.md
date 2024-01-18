

# API Data Sources and Availability.

Our platform gets data from various sources to create a complete view of a shipment and its containers. However, some data is not universally available from all sources, and some are unavailable until certain milestones pass. This page will help you understand which data sources we support, which data items your code should universally expect, and which you need to code more defensively around.

# Data Sources

- **Ocean Carriers (aka Steamship Lines):** Bill of lading/booking details, vessel eta, containers and Milestones
- **Container Terminal Operators:** Container availability, last free day, holds, fees, etc
- **AIS Data:** Vessel details and real-time location tracking (coming soon!)
- **Container Rail Carriers:** Container milestones via rail (coming soon!)

## Supported Ocean Carriers
View a complete list of supported carriers and attributes on [Google Sheets](https://docs.google.com/spreadsheets/d/1cWK8sNpkjY5V-KlXe1fHi8mU_at2HcJYqjCvGQgixQk/edit#gid=0)

[![Carriers Screenshot](../../assets/images/carriers_screenshot.png  "Carriers Screenshot")](https://docs.google.com/spreadsheets/d/1cWK8sNpkjY5V-KlXe1fHi8mU_at2HcJYqjCvGQgixQk/edit#gid=0)


## Ports and Terminals
Presently, the Terminal 49 api integrates with terminals at the following ports:
- Baltimore
- Boston
- Charleston
- Fraser Surrey (CA)
- Halifax (CA)
- Houston
- Jacksonville
- London Gateway (UK)
- Long Beach 
- Los Angeles
- Miami
- Mobile
- Montreal
- New Orleans
- New York / New Jersey
- Oakland
- Philadelphia
- Port Everglades
- Portland
- Prince Rupert (CA)
- Savannah
- Seattle
- Southampton (UK)
- Tacoma
- Tampa
- Vancouver (CA)
- Virginia

You can view a complete list of supported terminals and attributes on [Google Sheets](https://docs.google.com/spreadsheets/d/1cWK8sNpkjY5V-KlXe1fHi8mU_at2HcJYqjCvGQgixQk/edit#gid=1406366493)


## Known Issues (ocean)
Shipment data is populated from requests to the shipping lines.

Below are a list of known issuses with our data sources:

### Evergreen, ICL
- All dates are provided as dates, not datetimes. We record and return them all as midnight at the location the event happened (when location is available) or midnight UTC.

### MSC
- All dates except ETD and ETA are provided as dates, not datetimes. We record and return them all as midnight at the location the event happened (when location is available) or midnight UTC.

### COSCO
- They only provide the most recent event at this time.

### Yang-Ming
- When BL has multiple containers, the container weight returned is the average of the shipment. (i.e. the BL gross weight / number of containers)

# Data Fields & Availability

Below is a list of data that can be retrieved via the API, including whether is is always available, or whether it is only supported by certain carriers (Carrier Dependent), certain Terminals (Terminal Dependent) or on certain types of journeys (Journey dependent).

## Shipment Data
Shipment Data is the primary data that comes from the Carrier. It containers the details of the shipment retrieved from the Bill of Lading, and references multiple container objects.

| Data                                           | Availability            | More details           | Notes |
| ------ |-----|-----|-----|
| Port of Lading                                 | Always                               | Port of Lading name, Port of Lading UN/LOCODE, Port of Lading Timezone                |                                                                            |
| Port of Discharge                              | Always                               | Port of Discharge name, Port of discharge UN/LOCODE,Port of Discharge Timezone        |                                                                            |
| Final Destination beyond Port of Discharge     | Carrier dependent, Journey Dependent | ,Destination name, Destination UN/LOCODE, Destination UN/LOCODE, Destination Timezone | Only for shipments with inland moves provided by or booked by the carrier. |
| Listing of Container Numbers                   | Always                               | A list of container numbers with data attributes listed below                         |                                                                            |
| Bill of Lading Number                          | Always (inputted by user)            | BOL                                                                                   |                                                                            |
| Shipping Line Details                          | Always                               | SCAC, SSL Name                                                                        |                                                                            |
| Voyage Details                                 | Milestone-based                      | Vessel Name, Vessel IMO, Voyage Number                                                |                                                                            |
| Estimated Time of Departure                    | Carrier dependent                    | Timestamp                                                                             |                                                                            |
| Actual Time of Departure                       | Always                               | Timestamp                                                                             | After departure                                                            |
| Estimated Time of Arrival at Port of Discharge | Carrier dependent                    | Timestamp                                                                             |                                                                            |
| Actual Time of Arrival at Port of Discharge    | Always                               | Timestamp                                                                             | Available after arrival                                                    |
| Estimated Time of Arrival at Final Destination | Carrier dependent, Journey dependent | Timestamp                                                                             | Only for vessels with inland moves.                                        |


## Container Data
At the container level, the following data is available. Container data is combined from all sources to create a single data view of the container. As such, some of this data will only be available when certain milestones have passed.

|    Data          |     Availability          |                More Details                   |        Notes          |
| ---------------- | ----------------- | ------------------------------------------------ | -------------------- |
| Container Number | Always            | number                                           |                      |
| Seal Number      | Carrier dependent | number                                           |                      |
| Equipment Type   | Always            | Dry, reefer, open top, flat rack, tank, hard top | Enumerated data type |
| Equipment length | Always            | 20, 40, 45, 50                                   | Enumerated Data Type |
| Equipment height | Always            | Standard, high cube                              | Enumerated Data Type |
| Weight           | Carrier Dependent | Number                                           |                      |
| Terminal Availability                    | Always         | Availability Known, Availability for Pickup | |
| Holds                           | Terminal  Dependent     | Array of    statuses   |  Each status includes the hold name (one of: customs, freight, TMF, other, USDA) and the status (pending, hold) as well as any extra description|
| Fees                            | Terminal Dependent| Array of statuses| Each status includes the fee type (one of: Demurrage, Exam, Other) and the amount the hold is for  (a float)|
| Last Free Day                   | Terminal Dependent| Date of last free day |     |
| Arrived at Port of Discharge    | Always          | Once Arrived |        |
| Discharged at Port of Discharge | Always         | Once discharged          |                |
| Full Out at Port of Discharge   | Always         |  | |
| Full out at final destination   | Journey Dependent | Only if non-port final destination |  |




##  Milestone Event Data
When a milestone passes, the Terminal49 API will ping one of your webhooks with a Milestone event. For each milestone, the following data is always provided. Container, Shipment, Vessel, Location, and Terminal data will be provided as objects containing the above information.

| Milestone Data |         Description                                              |
| -------------- | ---------------------------------------------------------------- |
| Event Name     | the name of the event. e.g. 'container.transport.vessel\_loaded' |
| Created At     | when the event was created in our system                         |
| Timestamp      | when the event occured                                           |
| Timezone       | Which timezone did the event occur in.                           |
| Voyage Number  | the voyage number of the vessel                                  |
| Container      | A link to the Container Data                                     |
| Shipment       | A link to the Shipment Data                                      |
| Vessel         | Which vessel did the event occur on.                             |
| Location       | Where did the event oocur.                                       |
| Terminal       | Which terminal did this occur at.                                |

## Milestones Events Supported
A list of milestones that the API can track and the event name used in the API. In the future, more events may be supported.

|              Milestone Event Name        | Event Name           |
| -------------------- | -------------------------------------- |
| Vessel Loaded   | container.transport.vessel\_loaded |
| Vessel Departed   | container.transport.vessel\_departed |
| Vessel Arrived    | container.transport.vessel\_arrived |
| Vessel Berthed    | container.transport.vessel\_berthed |
| Vessel Discharged   | container.transport.vessel\_discharged |
| Empty Out   | container.transport.empty\_oud |
| Full In   | container.transport.full\_id |
| Full Out    | container.transport.full\_out |
| Empty In    | container.transport.empty\_id |
| Rail Departed   | container.transport.rail\_departed |
| Rail Arrived    | container.transport.rail\_arrived |
| Rail Loaded   | container.transport.rail\_loaded |
| Rail Unloaded   | container.transport.rail\_unloaded |
| Transshipment Arrived   | container.transport.transshipment\_arrived |
| Transshipment Discharged    | container.transport.transshipment\_discharged |
| Transshipment Loaded    | container.transport.transshipment\_loaded |
| Transshipment Departed    | container.transport.transshipment\_departed |
| Feeder Arrived    | container.transport.feeder\_arrived |
| Feeder Discharged   | container.transport.feeder\_discharged |
| Feeder Loaded   | container.transport.feeder\_loaded |
| Feeder Departed   | container.transport.feeder\_departed |
