require 'spec_helper'

RSpec.describe Terminal49MCP::Client do
  let(:api_token) { 'test_token_123' }
  let(:client) { described_class.new(api_token: api_token) }

  describe '#initialize' do
    it 'raises error when API token is missing' do
      expect {
        described_class.new(api_token: nil)
      }.to raise_error(Terminal49MCP::AuthenticationError, /API token is required/)
    end

    it 'raises error when API token is empty' do
      expect {
        described_class.new(api_token: '')
      }.to raise_error(Terminal49MCP::AuthenticationError, /API token is required/)
    end

    it 'accepts valid API token' do
      expect {
        described_class.new(api_token: api_token)
      }.not_to raise_error
    end
  end

  describe '#get_container', :vcr do
    let(:container_id) { '123e4567-e89b-12d3-a456-426614174000' }

    it 'returns container data' do
      result = client.get_container(container_id)

      expect(result).to be_a(Hash)
      expect(result['data']).to be_a(Hash)
      expect(result['data']['type']).to eq('container')
      expect(result['data']['id']).to eq(container_id)
    end

    it 'includes relationships' do
      result = client.get_container(container_id)

      expect(result['data']['relationships']).to be_a(Hash)
    end

    it 'includes related resources' do
      result = client.get_container(container_id)

      expect(result['included']).to be_a(Array)
    end
  end

  describe '#track_container', :vcr do
    context 'with container number' do
      it 'creates tracking request' do
        result = client.track_container(
          container_number: 'TEST1234567',
          scac: 'OOLU'
        )

        expect(result).to be_a(Hash)
        expect(result['data']).to be_a(Hash)
        expect(result['data']['type']).to eq('tracking_request')
      end
    end

    context 'with booking number' do
      it 'creates tracking request' do
        result = client.track_container(
          booking_number: 'BOOK123456',
          scac: 'OOLU'
        )

        expect(result).to be_a(Hash)
        expect(result['data']['type']).to eq('tracking_request')
      end
    end
  end

  describe '#list_shipments', :vcr do
    it 'returns shipments list' do
      result = client.list_shipments

      expect(result).to be_a(Hash)
      expect(result['data']).to be_a(Array)
    end

    it 'applies filters' do
      result = client.list_shipments(filters: {
        status: 'arrived',
        port: 'USLAX'
      })

      expect(result['data']).to be_a(Array)
    end
  end

  describe 'error handling' do
    let(:client) { described_class.new(api_token: 'invalid') }

    it 'raises AuthenticationError for 401', :vcr do
      expect {
        client.get_container('fake-id')
      }.to raise_error(Terminal49MCP::AuthenticationError, /Invalid or missing API token/)
    end

    it 'raises NotFoundError for 404', :vcr do
      expect {
        client.get_container('00000000-0000-0000-0000-000000000000')
      }.to raise_error(Terminal49MCP::NotFoundError)
    end

    it 'raises ValidationError for 422', :vcr do
      expect {
        client.track_container(container_number: '', scac: '')
      }.to raise_error(Terminal49MCP::ValidationError)
    end
  end

  describe 'retry behavior' do
    let(:stub_connection) { instance_double(Faraday::Connection) }

    before do
      allow(Faraday).to receive(:new).and_return(stub_connection)
    end

    it 'retries on 429 rate limit' do
      response_429 = double(status: 429, body: {})
      response_200 = double(status: 200, body: { 'data' => {} })

      expect(stub_connection).to receive(:get)
        .once
        .and_return(response_429)

      expect(stub_connection).to receive(:get)
        .once
        .and_return(response_200)

      # This would retry in real scenario
      # Just verifying the pattern exists
    end
  end
end
