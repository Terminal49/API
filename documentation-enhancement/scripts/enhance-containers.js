#!/usr/bin/env node
/**
 * Enhance container endpoint documentation
 */

const fs = require('fs');
const path = require('path');

// Load the OpenAPI spec
const openapiPath = path.join(__dirname, '../../docs/openapi.json');
const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));

console.log('Enhancing container endpoint documentation...\n');

// Enhance GET /containers
if (openapi.paths && openapi.paths['/containers'] && openapi.paths['/containers'].get) {
  const get = openapi.paths['/containers'].get;
  
  // Preserve and enhance existing description
  const currentDesc = get.description || 'Returns a list of containers.';
  
  get.description = `${currentDesc}

**Container Lifecycle**

Containers progress through these key stages:
1. **In Transit** - On vessel heading to port
2. **Arrived** - Vessel at port (\`pod_arrived_at\`)
3. **Discharged** - Unloaded from vessel (\`pod_discharged_at\`)
4. **Available** - Released and ready for pickup
5. **Full Out** - Picked up from terminal (\`pod_full_out_at\`)

**Key Information Tracked**

- **Location**: Current position within terminal or in transit
- **Availability**: Whether container can be picked up
- **Holds**: Customs, freight, or other holds preventing release
- **Fees**: Outstanding terminal charges
- **Last Free Day**: Deadline to avoid demurrage charges

**Including Related Data**

Use the \`include\` parameter to get additional information:
- **\`transport_events\`** - Full timeline of container movements
- **\`raw_events\`** - Original events from shipping line
- **\`shipment\`** - Parent shipment details
- **\`pod_terminal\`** - Terminal information`;

  // Enhance parameters
  if (get.parameters) {
    get.parameters.forEach(param => {
      if (param.name === 'include') {
        param.description = `Comma-separated list of related resources to include.
Available includes:
- **\`transport_events\`** - Detailed movement history
- **\`raw_events\`** - Original shipping line events
- **\`shipment\`** - Parent shipment information
- **\`pod_terminal\`** - Discharge terminal details
- **\`pickup_facility\`** - Inland facility information`;
        
        if (!param.examples) {
          param.examples = {
            with_events: {
              value: "transport_events,pod_terminal",
              summary: "Include events and terminal info"
            }
          };
        }
      }
      
      if (param.name === 'filter[available_for_pickup]') {
        param.description = `Filter by pickup availability status.
- **\`true\`** - Only containers ready for pickup (no holds, fees paid)
- **\`false\`** - Containers with holds or pending fees`;
      }
      
      if (param.name === 'filter[pod_arrived_at_gte]') {
        param.description = 'Filter containers that arrived at port on or after this date (ISO 8601 format)';
      }
    });
  }

  // Add response examples
  if (!get.responses['200'].content) {
    get.responses['200'].content = { 'application/json': {} };
  }
  
  get.responses['200'].content['application/json'].examples = {
    containers_with_holds: {
      summary: "Containers with different hold statuses",
      value: {
        data: [
          {
            id: "584ebb17-e753-49d6-b411-3460897154fb",
            type: "container",
            attributes: {
              number: "HDMU2744338",
              seal_number: "24H1142418",
              available_for_pickup: false,
              holds_at_pod_terminal: [
                { status: "hold", name: "freight", description: "" },
                { status: "hold", name: "customs", description: "" }
              ],
              location_at_pod_terminal: "V-OMG081W",
              pod_arrived_at: null,
              pod_discharged_at: null,
              pickup_lfd: null
            }
          }
        ]
      }
    },
    available_container: {
      summary: "Container ready for pickup",
      value: {
        data: [
          {
            id: "b3f4f7e4-6f4b-4c89-8f54-10094565e4e7",
            type: "container",
            attributes: {
              number: "MSNU7926760",
              available_for_pickup: true,
              holds_at_pod_terminal: [],
              fees_at_pod_terminal: [],
              location_at_pod_terminal: "YARD K376E (Grounded)",
              pod_arrived_at: "2025-07-08T21:17:25Z",
              pod_discharged_at: "2025-07-09T07:00:00Z",
              pickup_lfd: "2025-09-06T07:00:00Z"
            }
          }
        ]
      }
    }
  };

  console.log('✓ Enhanced GET /containers');
}

// Enhance container schema
if (openapi.components && openapi.components.schemas && openapi.components.schemas.container) {
  const schema = openapi.components.schemas.container;
  
  // Enhance attributes
  if (schema.properties && schema.properties.attributes && schema.properties.attributes.properties) {
    const attrs = schema.properties.attributes.properties;
    
    // Basic fields
    if (attrs.number) {
      attrs.number.description = 'Container number in ISO 6346 format (4 letters + 7 digits, e.g., "MSCU1234567")';
    }
    
    if (attrs.seal_number) {
      attrs.seal_number.description = 'Security seal number affixed to the container';
    }
    
    if (attrs.equipment_type) {
      attrs.equipment_type.description = 'Type of container equipment: "dry", "reefer", "open_top", "flat_rack", "tank", etc.';
    }
    
    if (attrs.equipment_length) {
      attrs.equipment_length.description = 'Container length in feet (20, 40, or 45)';
    }
    
    if (attrs.equipment_height) {
      attrs.equipment_height.description = 'Container height: "standard" (8\'6") or "high_cube" (9\'6")';
    }
    
    // Status fields
    if (attrs.available_for_pickup) {
      attrs.available_for_pickup.description = `Whether the container can be picked up from the terminal.
Requires: all holds released, fees paid, and customs clearance`;
    }
    
    if (attrs.availability_known) {
      attrs.availability_known.description = 'Whether availability status has been determined. False during initial tracking';
    }
    
    if (attrs.location_at_pod_terminal) {
      attrs.location_at_pod_terminal.description = `Current location within the terminal (e.g., "YARD K376E (Grounded)").
Null if container has left the terminal`;
    }
    
    // Holds and fees
    if (attrs.holds_at_pod_terminal) {
      attrs.holds_at_pod_terminal.description = `Active holds preventing pickup. Each hold contains:
- status: "hold" for active holds
- name: Type of hold ("customs", "freight", "other")  
- description: Additional details`;
    }
    
    if (attrs.fees_at_pod_terminal) {
      attrs.fees_at_pod_terminal.description = 'Outstanding terminal fees. Empty array means no fees due';
    }
    
    // Important dates
    if (attrs.pickup_lfd) {
      attrs.pickup_lfd.description = 'Last Free Day - final day to pick up without demurrage charges (ISO 8601)';
    }
    
    if (attrs.pod_arrived_at) {
      attrs.pod_arrived_at.description = 'When the vessel arrived at the port of discharge (ISO 8601)';
    }
    
    if (attrs.pod_discharged_at) {
      attrs.pod_discharged_at.description = 'When the container was unloaded from the vessel (ISO 8601)';
    }
    
    if (attrs.pod_full_out_at) {
      attrs.pod_full_out_at.description = 'When the container left the terminal - picked up (ISO 8601)';
    }
    
    // Rail fields
    if (attrs.pod_rail_carrier_scac) {
      attrs.pod_rail_carrier_scac.description = 'Rail carrier at port of discharge (e.g., "BNSF", "UP")';
    }
    
    if (attrs.ind_facility_lfd_on) {
      attrs.ind_facility_lfd_on.description = 'Last free day at inland facility for rail shipments';
    }
  }
  
  console.log('✓ Enhanced container schema');
}

// Save the enhanced OpenAPI
fs.writeFileSync(openapiPath, JSON.stringify(openapi, null, 2));

console.log('\n✅ Container endpoint enhancements complete!');
console.log('Mintlify should automatically reload.');
console.log('Check: http://localhost:3001/api-reference/containers/list-containers');