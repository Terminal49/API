module Terminal49MCP
  # HTTP client for Terminal49 API
  # Handles authentication, retries, and error mapping
  class Client
    RETRY_STATUSES = [429, 500, 502, 503, 504].freeze
    RETRY_METHODS = [:get, :post, :patch].freeze
    MAX_RETRIES = 3

    def initialize(api_token: nil, api_base_url: nil)
      @api_token = api_token || Terminal49MCP.configuration.api_token
      @api_base_url = api_base_url || Terminal49MCP.configuration.api_base_url

      raise AuthenticationError, 'API token is required' if @api_token.nil? || @api_token.empty?
    end

    # GET /containers/:id
    def get_container(id)
      response = connection.get("containers/#{id}") do |req|
        req.params['include'] = 'shipment,pod_terminal,transport_events'
      end

      handle_response(response)
    end

    # POST /tracking_requests
    def track_container(container_number: nil, booking_number: nil, scac: nil, ref_numbers: nil)
      request_type = container_number ? 'container' : 'bill_of_lading'
      request_number = container_number || booking_number

      payload = {
        data: {
          type: 'tracking_request',
          attributes: {
            request_type: request_type,
            request_number: request_number,
            scac: scac,
            ref_numbers: ref_numbers
          }.compact
        }
      }

      response = connection.post('tracking_requests', payload.to_json)
      handle_response(response)
    end

    # GET /shipments
    def list_shipments(filters: {})
      response = connection.get('shipments') do |req|
        req.params['include'] = 'containers,pod_terminal,pol_terminal'

        # Apply filters
        filters.each do |key, value|
          case key
          when :status
            req.params['filter[status]'] = value
          when :port
            req.params['filter[pod_locode]'] = value
          when :carrier
            req.params['filter[line_scac]'] = value
          when :updated_after
            req.params['filter[updated_at]'] = value
          end
        end
      end

      handle_response(response)
    end

    # GET /containers/:id (focused on demurrage/LFD/fees)
    def get_demurrage(container_id)
      response = connection.get("containers/#{container_id}") do |req|
        req.params['include'] = 'pod_terminal'
      end

      data = handle_response(response)

      # Extract demurrage-relevant fields
      container = data.dig('data', 'attributes') || {}
      {
        container_id: container_id,
        pickup_lfd: container['pickup_lfd'],
        pickup_appointment_at: container['pickup_appointment_at'],
        available_for_pickup: container['available_for_pickup'],
        fees_at_pod_terminal: container['fees_at_pod_terminal'],
        holds_at_pod_terminal: container['holds_at_pod_terminal'],
        pod_arrived_at: container['pod_arrived_at'],
        pod_discharged_at: container['pod_discharged_at']
      }
    end

    # GET /containers/:id (focused on rail milestones)
    def get_rail_milestones(container_id)
      response = connection.get("containers/#{container_id}") do |req|
        req.params['include'] = 'transport_events'
      end

      data = handle_response(response)
      container = data.dig('data', 'attributes') || {}

      {
        container_id: container_id,
        pod_rail_carrier_scac: container['pod_rail_carrier_scac'],
        ind_rail_carrier_scac: container['ind_rail_carrier_scac'],
        pod_rail_loaded_at: container['pod_rail_loaded_at'],
        pod_rail_departed_at: container['pod_rail_departed_at'],
        ind_rail_arrived_at: container['ind_rail_arrived_at'],
        ind_rail_unloaded_at: container['ind_rail_unloaded_at'],
        ind_eta_at: container['ind_eta_at'],
        ind_ata_at: container['ind_ata_at'],
        rail_events: extract_rail_events(data.dig('included') || [])
      }
    end

    private

    def connection
      @connection ||= Faraday.new(url: @api_base_url) do |conn|
        conn.request :json
        conn.response :json, content_type: /\bjson$/

        # Retry configuration
        conn.request :retry,
                     max: MAX_RETRIES,
                     interval: 0.5,
                     interval_randomness: 0.5,
                     backoff_factor: 2,
                     retry_statuses: RETRY_STATUSES,
                     methods: RETRY_METHODS

        conn.headers['Authorization'] = "Token #{@api_token}"
        conn.headers['Content-Type'] = 'application/vnd.api+json'
        conn.headers['Accept'] = 'application/vnd.api+json'
        conn.headers['User-Agent'] = "Terminal49-MCP/#{Terminal49MCP::VERSION}"

        conn.adapter Faraday.default_adapter
      end
    end

    def handle_response(response)
      case response.status
      when 200, 201, 202
        response.body
      when 204
        { data: nil }
      when 400
        raise ValidationError, extract_error_message(response.body)
      when 401
        raise AuthenticationError, 'Invalid or missing API token'
      when 403
        raise AuthenticationError, 'Access forbidden'
      when 404
        raise NotFoundError, extract_error_message(response.body) || 'Resource not found'
      when 422
        raise ValidationError, extract_error_message(response.body)
      when 429
        raise RateLimitError, 'Rate limit exceeded'
      when 500..599
        raise UpstreamError, "Upstream server error (#{response.status})"
      else
        raise Error, "Unexpected response status: #{response.status}"
      end
    end

    def extract_error_message(body)
      return nil unless body.is_a?(Hash)

      errors = body['errors']
      return nil unless errors.is_a?(Array) && !errors.empty?

      errors.map do |error|
        detail = error['detail']
        title = error['title']
        pointer = error.dig('source', 'pointer')

        msg = detail || title || 'Unknown error'
        msg += " (#{pointer})" if pointer
        msg
      end.join('; ')
    end

    def extract_rail_events(included)
      included
        .select { |item| item['type'] == 'transport_event' }
        .select { |item| item.dig('attributes', 'event')&.start_with?('rail.') }
        .map { |item| item['attributes'] }
    end
  end
end
