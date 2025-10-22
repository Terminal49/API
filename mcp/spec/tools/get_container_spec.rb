require 'spec_helper'

RSpec.describe Terminal49MCP::Tools::GetContainer do
  let(:tool) { described_class.new }
  let(:container_id) { '123e4567-e89b-12d3-a456-426614174000' }

  describe '#to_schema' do
    it 'returns valid MCP tool schema' do
      schema = tool.to_schema

      expect(schema[:name]).to eq('get_container')
      expect(schema[:description]).to be_a(String)
      expect(schema[:inputSchema]).to be_a(Hash)
      expect(schema[:inputSchema][:type]).to eq('object')
      expect(schema[:inputSchema][:properties]).to have_key(:id)
      expect(schema[:inputSchema][:required]).to eq(['id'])
    end
  end

  describe '#execute' do
    context 'with valid container ID', :vcr do
      it 'returns formatted container data' do
        result = tool.execute({ 'id' => container_id })

        expect(result).to be_a(Hash)
        expect(result).to have_key(:id)
        expect(result).to have_key(:container_number)
        expect(result).to have_key(:status)
        expect(result).to have_key(:equipment)
        expect(result).to have_key(:location)
        expect(result).to have_key(:demurrage)
        expect(result).to have_key(:rail)
      end

      it 'includes equipment details' do
        result = tool.execute({ 'id' => container_id })

        expect(result[:equipment]).to have_key(:type)
        expect(result[:equipment]).to have_key(:length)
        expect(result[:equipment]).to have_key(:height)
        expect(result[:equipment]).to have_key(:weight_lbs)
      end

      it 'includes demurrage information' do
        result = tool.execute({ 'id' => container_id })

        expect(result[:demurrage]).to have_key(:pickup_lfd)
        expect(result[:demurrage]).to have_key(:fees_at_pod_terminal)
        expect(result[:demurrage]).to have_key(:holds_at_pod_terminal)
      end

      it 'logs execution metrics' do
        expect(Terminal49MCP.logger).to receive(:info).at_least(:once)

        tool.execute({ 'id' => container_id })
      end
    end

    context 'with missing container ID' do
      it 'raises ValidationError' do
        expect {
          tool.execute({})
        }.to raise_error(Terminal49MCP::ValidationError, /Container ID is required/)
      end

      it 'raises ValidationError for empty string' do
        expect {
          tool.execute({ 'id' => '' })
        }.to raise_error(Terminal49MCP::ValidationError, /Container ID is required/)
      end
    end

    context 'with non-existent container', :vcr do
      let(:fake_id) { '00000000-0000-0000-0000-000000000000' }

      it 'raises NotFoundError' do
        expect {
          tool.execute({ 'id' => fake_id })
        }.to raise_error(Terminal49MCP::NotFoundError)
      end

      it 'logs error metrics' do
        expect(Terminal49MCP.logger).to receive(:error).at_least(:once)

        begin
          tool.execute({ 'id' => fake_id })
        rescue Terminal49MCP::NotFoundError
          # Expected
        end
      end
    end

    context 'with invalid API token', :vcr do
      before do
        Terminal49MCP.configuration.api_token = 'invalid_token'
      end

      after do
        Terminal49MCP.configuration.api_token = ENV['T49_API_TOKEN'] || 'test_token_123'
      end

      it 'raises AuthenticationError' do
        expect {
          tool.execute({ 'id' => container_id })
        }.to raise_error(Terminal49MCP::AuthenticationError)
      end
    end
  end

  describe 'status determination' do
    let(:client) { instance_double(Terminal49MCP::Client) }

    before do
      allow(Terminal49MCP::Client).to receive(:new).and_return(client)
    end

    it 'returns "available_for_pickup" when container is available' do
      allow(client).to receive(:get_container).and_return({
        'data' => {
          'id' => container_id,
          'attributes' => {
            'available_for_pickup' => true,
            'pod_discharged_at' => '2024-01-15T10:00:00Z'
          }
        }
      })

      result = tool.execute({ 'id' => container_id })
      expect(result[:status]).to eq('available_for_pickup')
    end

    it 'returns "discharged" when container is discharged but not available' do
      allow(client).to receive(:get_container).and_return({
        'data' => {
          'id' => container_id,
          'attributes' => {
            'available_for_pickup' => false,
            'pod_discharged_at' => '2024-01-15T10:00:00Z',
            'pod_arrived_at' => '2024-01-14T08:00:00Z'
          }
        }
      })

      result = tool.execute({ 'id' => container_id })
      expect(result[:status]).to eq('discharged')
    end

    it 'returns "arrived" when container arrived but not discharged' do
      allow(client).to receive(:get_container).and_return({
        'data' => {
          'id' => container_id,
          'attributes' => {
            'available_for_pickup' => false,
            'pod_discharged_at' => nil,
            'pod_arrived_at' => '2024-01-14T08:00:00Z'
          }
        }
      })

      result = tool.execute({ 'id' => container_id })
      expect(result[:status]).to eq('arrived')
    end

    it 'returns "in_transit" when container has not arrived' do
      allow(client).to receive(:get_container).and_return({
        'data' => {
          'id' => container_id,
          'attributes' => {
            'available_for_pickup' => false,
            'pod_discharged_at' => nil,
            'pod_arrived_at' => nil
          }
        }
      })

      result = tool.execute({ 'id' => container_id })
      expect(result[:status]).to eq('in_transit')
    end
  end
end
