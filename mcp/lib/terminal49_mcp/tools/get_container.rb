module Terminal49MCP
  module Tools
    # Get container by ID
    # Retrieves detailed container information including status, milestones, holds, and LFD
    class GetContainer
      def to_schema
        {
          name: 'get_container',
          description: 'Get detailed information about a container by its Terminal49 ID. ' \
                       'Returns container status, milestones, holds, LFD (Last Free Day), fees, ' \
                       'and related shipment information.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The Terminal49 container ID (UUID format)'
              }
            },
            required: ['id']
          }
        }
      end

      def execute(arguments)
        id = arguments['id']

        raise ValidationError, 'Container ID is required' if id.nil? || id.empty?

        client = Client.new
        start_time = Time.now

        Terminal49MCP.logger.info({
          event: 'tool.execute.start',
          tool: 'get_container',
          container_id: id,
          timestamp: start_time.iso8601
        }.to_json)

        begin
          result = client.get_container(id)
          duration_ms = ((Time.now - start_time) * 1000).round(2)

          Terminal49MCP.logger.info({
            event: 'tool.execute.complete',
            tool: 'get_container',
            container_id: id,
            duration_ms: duration_ms,
            timestamp: Time.now.iso8601
          }.to_json)

          format_response(result)
        rescue => e
          duration_ms = ((Time.now - start_time) * 1000).round(2)

          Terminal49MCP.logger.error({
            event: 'tool.execute.error',
            tool: 'get_container',
            container_id: id,
            error: e.class.name,
            message: e.message,
            duration_ms: duration_ms,
            timestamp: Time.now.iso8601
          }.to_json)

          raise
        end
      end

      private

      def format_response(api_response)
        container = api_response.dig('data', 'attributes') || {}
        relationships = api_response.dig('data', 'relationships') || {}
        included = api_response['included'] || []

        # Extract shipment info
        shipment = extract_included(included, relationships.dig('shipment', 'data', 'id'), 'shipment')
        pod_terminal = extract_included(included, relationships.dig('pod_terminal', 'data', 'id'), 'terminal')

        {
          id: api_response.dig('data', 'id'),
          container_number: container['number'],
          status: determine_status(container),
          equipment: {
            type: container['equipment_type'],
            length: container['equipment_length'],
            height: container['equipment_height'],
            weight_lbs: container['weight_in_lbs']
          },
          location: {
            current_location: container['location_at_pod_terminal'],
            available_for_pickup: container['available_for_pickup'],
            pod_arrived_at: container['pod_arrived_at'],
            pod_discharged_at: container['pod_discharged_at']
          },
          demurrage: {
            pickup_lfd: container['pickup_lfd'],
            pickup_appointment_at: container['pickup_appointment_at'],
            fees_at_pod_terminal: container['fees_at_pod_terminal'],
            holds_at_pod_terminal: container['holds_at_pod_terminal']
          },
          rail: {
            pod_rail_carrier: container['pod_rail_carrier_scac'],
            pod_rail_loaded_at: container['pod_rail_loaded_at'],
            destination_eta: container['ind_eta_at'],
            destination_ata: container['ind_ata_at']
          },
          shipment: shipment ? {
            id: shipment['id'],
            ref_numbers: shipment.dig('attributes', 'ref_numbers'),
            line: shipment.dig('attributes', 'line')
          } : nil,
          pod_terminal: pod_terminal ? {
            id: pod_terminal['id'],
            name: pod_terminal.dig('attributes', 'name'),
            firms_code: pod_terminal.dig('attributes', 'firms_code')
          } : nil,
          updated_at: container['updated_at'],
          created_at: container['created_at']
        }
      end

      def determine_status(container)
        if container['available_for_pickup']
          'available_for_pickup'
        elsif container['pod_discharged_at']
          'discharged'
        elsif container['pod_arrived_at']
          'arrived'
        else
          'in_transit'
        end
      end

      def extract_included(included, id, type)
        return nil unless id

        included.find { |item| item['id'] == id && item['type'] == type }
      end
    end
  end
end
