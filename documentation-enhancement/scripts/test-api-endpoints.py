#!/usr/bin/env python3
import requests
import json
import os
from datetime import datetime

# Load API key from environment
API_KEY = os.getenv('TERMINAL_49_API_KEY', 'kJVzEaVQzRmyGCwcXVcTJAwU')
BASE_URL = 'https://api.terminal49.com/v2'

headers = {
    'Authorization': f'Bearer {API_KEY}',
    'Content-Type': 'application/vnd.api+json'
}

def test_endpoint(method, endpoint, params=None, data=None):
    """Test an API endpoint and return the response"""
    url = f"{BASE_URL}{endpoint}"
    
    try:
        if method == 'GET':
            response = requests.get(url, headers=headers, params=params)
        elif method == 'POST':
            response = requests.post(url, headers=headers, json=data)
        elif method == 'PATCH':
            response = requests.patch(url, headers=headers, json=data)
        else:
            return None
            
        return {
            'endpoint': endpoint,
            'method': method,
            'status_code': response.status_code,
            'headers': dict(response.headers),
            'response': response.json() if response.text else None,
            'response_time': response.elapsed.total_seconds()
        }
    except Exception as e:
        return {
            'endpoint': endpoint,
            'method': method,
            'error': str(e)
        }

# Test basic endpoints
print("Testing Terminal49 API endpoints...")
print("=" * 50)

# 1. Test Shipments endpoint
print("\n1. Testing GET /shipments")
shipments_result = test_endpoint('GET', '/shipments', params={'page[size]': 5})
print(f"Status: {shipments_result.get('status_code')}")
if shipments_result.get('response'):
    print(f"Response: {json.dumps(shipments_result['response'], indent=2)[:500]}...")

# Save full response
with open('api-responses/shipments-list.json', 'w') as f:
    json.dump(shipments_result, f, indent=2)

# 2. Test Containers endpoint
print("\n2. Testing GET /containers")
containers_result = test_endpoint('GET', '/containers', params={'page[size]': 5})
print(f"Status: {containers_result.get('status_code')}")

# 3. Test Shipping Lines
print("\n3. Testing GET /shipping_lines")
shipping_lines_result = test_endpoint('GET', '/shipping_lines')
print(f"Status: {shipping_lines_result.get('status_code')}")

# 4. Test Webhooks
print("\n4. Testing GET /webhooks")
webhooks_result = test_endpoint('GET', '/webhooks')
print(f"Status: {webhooks_result.get('status_code')}")

# 5. Test Tracking Requests
print("\n5. Testing GET /tracking_requests")
tracking_requests_result = test_endpoint('GET', '/tracking_requests', params={'page[size]': 5})
print(f"Status: {tracking_requests_result.get('status_code')}")

print("\n" + "=" * 50)
print("Initial connection test complete!")