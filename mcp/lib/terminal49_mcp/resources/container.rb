module Terminal49MCP
  module Resources
    # Container resource resolver
    # Provides compact container summaries via t49:container/{id} URIs
    class Container
      URI_PATTERN = %r{^t49:container/([a-f0-9-]{36})$}i.freeze

      def to_schema
        {
          uri: 't49:container/{id}',
          name: 'Terminal49 Container',
          description: 'Access container information by Terminal49 container ID. ' \
                       'Returns a compact summary including status, milestones, holds, and LFD.',
          mimeType: 'application/json'
        }
      end

      def matches?(uri)
        uri.match?(URI_PATTERN)
      end

      def read(uri)
        match = uri.match(URI_PATTERN)
        raise ValidationError, 'Invalid container URI format' unless match

        container_id = match[1]

        client = Client.new
        result = client.get_container(container_id)

        container = result.dig('data', 'attributes') || {}

        summary = generate_summary(container_id, container)

        {
          uri: uri,
          mimeType: 'text/markdown',
          text: summary
        }
      end

      private

      def generate_summary(id, container)
        <<~MARKDOWN
          # Container #{container['number']}

          **ID:** `#{id}`
          **Status:** #{determine_status(container)}
          **Equipment:** #{container['equipment_length']}' #{container['equipment_type']}

          ## Location & Availability

          - **Available for Pickup:** #{container['available_for_pickup'] ? 'Yes' : 'No'}
          - **Current Location:** #{container['location_at_pod_terminal'] || 'Unknown'}
          - **POD Arrived:** #{format_timestamp(container['pod_arrived_at'])}
          - **POD Discharged:** #{format_timestamp(container['pod_discharged_at'])}

          ## Demurrage & Fees

          - **Last Free Day (LFD):** #{format_date(container['pickup_lfd'])}
          - **Pickup Appointment:** #{format_timestamp(container['pickup_appointment_at'])}
          - **Fees:** #{container['fees_at_pod_terminal']&.any? ? container['fees_at_pod_terminal'].length : 'None'}
          - **Holds:** #{container['holds_at_pod_terminal']&.any? ? container['holds_at_pod_terminal'].length : 'None'}

          #{rail_section(container)}

          ---
          *Last Updated: #{format_timestamp(container['updated_at'])}*
        MARKDOWN
      end

      def rail_section(container)
        return '' unless container['pod_rail_carrier_scac']

        <<~MARKDOWN

          ## Rail Information

          - **Rail Carrier:** #{container['pod_rail_carrier_scac']}
          - **Rail Loaded:** #{format_timestamp(container['pod_rail_loaded_at'])}
          - **Destination ETA:** #{format_timestamp(container['ind_eta_at'])}
          - **Destination ATA:** #{format_timestamp(container['ind_ata_at'])}
        MARKDOWN
      end

      def determine_status(container)
        if container['available_for_pickup']
          'Available for Pickup'
        elsif container['pod_discharged_at']
          'Discharged at POD'
        elsif container['pod_arrived_at']
          'Arrived at POD'
        else
          'In Transit'
        end
      end

      def format_timestamp(ts)
        return 'N/A' unless ts

        Time.parse(ts).strftime('%Y-%m-%d %H:%M %Z')
      rescue
        ts
      end

      def format_date(date)
        return 'N/A' unless date

        Date.parse(date).strftime('%Y-%m-%d')
      rescue
        date
      end
    end
  end
end
