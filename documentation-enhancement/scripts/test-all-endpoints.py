#!/usr/bin/env python3
"""
Terminal49 API Documentation Improvement - Endpoint Testing Script
This script executes all API endpoints to collect real response data for documentation enhancement
"""

import requests
import json
import os
import sys
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
import time

# Configuration
API_KEY = os.getenv('TERMINAL_49_API_KEY', 'kJVzEaVQzRmyGCwcXVcTJAwU')
BASE_URL = 'https://api.terminal49.com/v2'
OUTPUT_DIR = 'api-responses'

# Ensure output directory exists
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(f"{OUTPUT_DIR}/shipments", exist_ok=True)
os.makedirs(f"{OUTPUT_DIR}/containers", exist_ok=True)
os.makedirs(f"{OUTPUT_DIR}/tracking-requests", exist_ok=True)
os.makedirs(f"{OUTPUT_DIR}/webhooks", exist_ok=True)
os.makedirs(f"{OUTPUT_DIR}/reference-data", exist_ok=True)
os.makedirs(f"{OUTPUT_DIR}/errors", exist_ok=True)

# Headers for API requests
headers = {
    'Authorization': f'Bearer {API_KEY}',
    'Content-Type': 'application/vnd.api+json',
    'Accept': 'application/vnd.api+json'
}

# Test container numbers for tracking
TEST_CONTAINERS = [
    "MSCU7861323",  # Example container number
    "TGHU9874563",  # Another example
]

class APITester:
    def __init__(self):
        self.results = []
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        
    def log(self, message: str, level: str = "INFO"):
        """Log messages with timestamp"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")
        
    def make_request(self, method: str, endpoint: str, params: Optional[Dict] = None, 
                    data: Optional[Dict] = None, description: str = "") -> Dict[str, Any]:
        """Make an API request and return detailed response information"""
        url = f"{BASE_URL}{endpoint}"
        self.total_requests += 1
        
        self.log(f"Testing {method} {endpoint} - {description}")
        
        try:
            start_time = time.time()
            
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method == 'POST':
                response = requests.post(url, headers=headers, json=data, timeout=30)
            elif method == 'PATCH':
                response = requests.patch(url, headers=headers, json=data, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            response_time = time.time() - start_time
            
            # Parse response
            response_data = None
            if response.text:
                try:
                    response_data = response.json()
                except json.JSONDecodeError:
                    response_data = {"raw_text": response.text}
            
            result = {
                "endpoint": endpoint,
                "method": method,
                "description": description,
                "url": url,
                "params": params,
                "request_body": data,
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "response": response_data,
                "response_time": response_time,
                "response_size": len(response.content),
                "timestamp": datetime.now().isoformat()
            }
            
            if response.status_code >= 200 and response.status_code < 300:
                self.successful_requests += 1
                self.log(f"✓ Success: {response.status_code} ({response_time:.2f}s)")
            else:
                self.failed_requests += 1
                self.log(f"✗ Failed: {response.status_code}", "ERROR")
                
            return result
            
        except requests.exceptions.Timeout:
            self.failed_requests += 1
            self.log(f"✗ Timeout error", "ERROR")
            return {
                "endpoint": endpoint,
                "method": method,
                "description": description,
                "error": "Request timeout after 30 seconds",
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            self.failed_requests += 1
            self.log(f"✗ Error: {str(e)}", "ERROR")
            return {
                "endpoint": endpoint,
                "method": method,
                "description": description,
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    def save_response(self, result: Dict[str, Any], filename: str):
        """Save response to file"""
        filepath = f"{OUTPUT_DIR}/{filename}"
        with open(filepath, 'w') as f:
            json.dump(result, f, indent=2)
        self.log(f"Saved response to {filepath}")
    
    def test_shipments_endpoints(self):
        """Test all shipment-related endpoints"""
        self.log("\n=== TESTING SHIPMENTS ENDPOINTS ===\n")
        
        # 1. List shipments
        result = self.make_request(
            'GET', '/shipments',
            params={'page[size]': 10},
            description="List shipments with pagination"
        )
        self.save_response(result, 'shipments/list-basic.json')
        
        # 2. List with includes
        result = self.make_request(
            'GET', '/shipments',
            params={
                'page[size]': 5,
                'include': 'containers,terminated_container_count'
            },
            description="List shipments with container includes"
        )
        self.save_response(result, 'shipments/list-with-includes.json')
        
        # 3. List with filters
        result = self.make_request(
            'GET', '/shipments',
            params={
                'page[size]': 5,
                'filter[tracking_status]': 'on_track'
            },
            description="List shipments filtered by tracking status"
        )
        self.save_response(result, 'shipments/list-filtered.json')
        
        # 4. Get specific shipment (if we have one from the list)
        if result.get('response') and result['response'].get('data'):
            shipment_id = result['response']['data'][0]['id']
            result = self.make_request(
                'GET', f'/shipments/{shipment_id}',
                description="Get specific shipment details"
            )
            self.save_response(result, 'shipments/single-shipment.json')
            
        # 5. Test creating a shipment
        create_data = {
            "data": {
                "type": "shipment",
                "attributes": {
                    "tags": ["test", "documentation"],
                    "customer_reference": "DOC-TEST-001"
                }
            }
        }
        result = self.make_request(
            'POST', '/shipments',
            data=create_data,
            description="Create a new shipment"
        )
        self.save_response(result, 'shipments/create-shipment.json')
        
    def test_tracking_requests_endpoints(self):
        """Test all tracking request endpoints"""
        self.log("\n=== TESTING TRACKING REQUESTS ENDPOINTS ===\n")
        
        # 1. List tracking requests
        result = self.make_request(
            'GET', '/tracking_requests',
            params={'page[size]': 10},
            description="List tracking requests"
        )
        self.save_response(result, 'tracking-requests/list-basic.json')
        
        # 2. Create tracking request
        create_data = {
            "data": {
                "type": "tracking_request",
                "attributes": {
                    "request_type": "by_container_id",
                    "container_id": TEST_CONTAINERS[0],
                    "shipping_line_scac": "MSCU"
                }
            }
        }
        result = self.make_request(
            'POST', '/tracking_requests',
            data=create_data,
            description="Create tracking request by container ID"
        )
        self.save_response(result, 'tracking-requests/create-by-container.json')
        
        # 3. Test different request types
        booking_data = {
            "data": {
                "type": "tracking_request",
                "attributes": {
                    "request_type": "by_booking_number",
                    "booking_number": "123456789",
                    "shipping_line_scac": "MSCU"
                }
            }
        }
        result = self.make_request(
            'POST', '/tracking_requests',
            data=booking_data,
            description="Create tracking request by booking number"
        )
        self.save_response(result, 'tracking-requests/create-by-booking.json')
        
    def test_containers_endpoints(self):
        """Test all container endpoints"""
        self.log("\n=== TESTING CONTAINERS ENDPOINTS ===\n")
        
        # 1. List containers
        result = self.make_request(
            'GET', '/containers',
            params={'page[size]': 10},
            description="List containers"
        )
        self.save_response(result, 'containers/list-basic.json')
        
        # 2. List with transport events
        result = self.make_request(
            'GET', '/containers',
            params={
                'page[size]': 5,
                'include': 'transport_events'
            },
            description="List containers with transport events"
        )
        self.save_response(result, 'containers/list-with-events.json')
        
        # 3. Get specific container (if available)
        if result.get('response') and result['response'].get('data'):
            container_id = result['response']['data'][0]['id']
            result = self.make_request(
                'GET', f'/containers/{container_id}',
                description="Get specific container details"
            )
            self.save_response(result, 'containers/single-container.json')
            
            # 4. Get container transport events
            result = self.make_request(
                'GET', f'/containers/{container_id}/transport_events',
                description="Get container transport events"
            )
            self.save_response(result, 'containers/transport-events.json')
            
            # 5. Get raw events
            result = self.make_request(
                'GET', f'/containers/{container_id}/raw_events',
                description="Get container raw events"
            )
            self.save_response(result, 'containers/raw-events.json')
    
    def test_webhook_endpoints(self):
        """Test webhook endpoints"""
        self.log("\n=== TESTING WEBHOOK ENDPOINTS ===\n")
        
        # 1. List webhooks
        result = self.make_request(
            'GET', '/webhooks',
            description="List configured webhooks"
        )
        self.save_response(result, 'webhooks/list.json')
        
        # 2. Get webhook notification examples
        result = self.make_request(
            'GET', '/webhook_notifications/examples',
            description="Get webhook notification examples"
        )
        self.save_response(result, 'webhooks/notification-examples.json')
        
        # 3. Create a test webhook
        webhook_data = {
            "data": {
                "type": "webhook",
                "attributes": {
                    "url": "https://example.com/webhooks/terminal49",
                    "secret": "test-secret-key",
                    "active": True,
                    "events": ["container.transport_event.created"]
                }
            }
        }
        result = self.make_request(
            'POST', '/webhooks',
            data=webhook_data,
            description="Create webhook subscription"
        )
        self.save_response(result, 'webhooks/create-webhook.json')
    
    def test_reference_data_endpoints(self):
        """Test reference data endpoints"""
        self.log("\n=== TESTING REFERENCE DATA ENDPOINTS ===\n")
        
        # 1. Shipping lines
        result = self.make_request(
            'GET', '/shipping_lines',
            description="List all shipping lines"
        )
        self.save_response(result, 'reference-data/shipping-lines.json')
        
        # 2. Ports
        result = self.make_request(
            'GET', '/ports',
            params={'page[size]': 20},
            description="List ports"
        )
        self.save_response(result, 'reference-data/ports-list.json')
        
        # 3. Search ports
        result = self.make_request(
            'GET', '/ports',
            params={
                'q': 'Los Angeles',
                'page[size]': 10
            },
            description="Search ports by name"
        )
        self.save_response(result, 'reference-data/ports-search.json')
        
        # 4. Vessels
        result = self.make_request(
            'GET', '/vessels',
            params={'page[size]': 10},
            description="List vessels"
        )
        self.save_response(result, 'reference-data/vessels-list.json')
        
        # 5. Parties (customers)
        result = self.make_request(
            'GET', '/parties',
            description="List parties/customers"
        )
        self.save_response(result, 'reference-data/parties.json')
    
    def test_error_scenarios(self):
        """Test various error scenarios"""
        self.log("\n=== TESTING ERROR SCENARIOS ===\n")
        
        # 1. Invalid endpoint
        result = self.make_request(
            'GET', '/invalid_endpoint',
            description="Test 404 Not Found"
        )
        self.save_response(result, 'errors/404-not-found.json')
        
        # 2. Invalid authentication
        old_headers = headers.copy()
        headers['Authorization'] = 'Bearer invalid_token'
        result = self.make_request(
            'GET', '/shipments',
            description="Test 401 Unauthorized"
        )
        self.save_response(result, 'errors/401-unauthorized.json')
        headers.update(old_headers)
        
        # 3. Invalid request body
        invalid_data = {
            "data": {
                "type": "tracking_request",
                "attributes": {
                    # Missing required fields
                }
            }
        }
        result = self.make_request(
            'POST', '/tracking_requests',
            data=invalid_data,
            description="Test 422 Unprocessable Entity"
        )
        self.save_response(result, 'errors/422-validation-error.json')
        
        # 4. Resource not found
        result = self.make_request(
            'GET', '/shipments/non-existent-id',
            description="Test 404 Resource Not Found"
        )
        self.save_response(result, 'errors/404-resource-not-found.json')
    
    def test_pagination_and_filtering(self):
        """Test pagination and filtering capabilities"""
        self.log("\n=== TESTING PAGINATION AND FILTERING ===\n")
        
        # 1. Test different page sizes
        for size in [1, 10, 50]:
            result = self.make_request(
                'GET', '/shipments',
                params={'page[size]': size},
                description=f"Test pagination with page size {size}"
            )
            self.save_response(result, f'shipments/pagination-size-{size}.json')
        
        # 2. Test page navigation
        result = self.make_request(
            'GET', '/shipments',
            params={
                'page[size]': 5,
                'page[number]': 2
            },
            description="Test pagination page 2"
        )
        self.save_response(result, 'shipments/pagination-page-2.json')
        
        # 3. Test multiple filters
        result = self.make_request(
            'GET', '/containers',
            params={
                'filter[pod_arrived_at_gte]': (datetime.now() - timedelta(days=30)).isoformat(),
                'filter[pod_arrived_at_lte]': datetime.now().isoformat(),
                'page[size]': 10
            },
            description="Test date range filtering"
        )
        self.save_response(result, 'containers/filtered-by-date.json')
    
    def generate_summary_report(self):
        """Generate a summary report of all tests"""
        summary = {
            "test_run": {
                "timestamp": datetime.now().isoformat(),
                "api_key_used": API_KEY[:10] + "...",
                "base_url": BASE_URL,
                "total_requests": self.total_requests,
                "successful_requests": self.successful_requests,
                "failed_requests": self.failed_requests,
                "success_rate": f"{(self.successful_requests/self.total_requests*100):.1f}%" if self.total_requests > 0 else "0%"
            },
            "endpoints_tested": len(set(r.get('endpoint', '') for r in self.results if 'endpoint' in r)),
            "response_times": {
                "average": sum(r.get('response_time', 0) for r in self.results if 'response_time' in r) / len([r for r in self.results if 'response_time' in r]) if self.results else 0,
                "max": max((r.get('response_time', 0) for r in self.results if 'response_time' in r), default=0),
                "min": min((r.get('response_time', 0) for r in self.results if 'response_time' in r), default=0)
            }
        }
        
        with open(f"{OUTPUT_DIR}/test-summary.json", 'w') as f:
            json.dump(summary, f, indent=2)
        
        self.log("\n=== TEST SUMMARY ===")
        self.log(f"Total Requests: {self.total_requests}")
        self.log(f"Successful: {self.successful_requests}")
        self.log(f"Failed: {self.failed_requests}")
        self.log(f"Success Rate: {summary['test_run']['success_rate']}")
        self.log(f"Average Response Time: {summary['response_times']['average']:.2f}s")
    
    def run_all_tests(self):
        """Run all test suites"""
        self.log("Starting Terminal49 API comprehensive testing...")
        self.log(f"Output directory: {OUTPUT_DIR}")
        self.log("=" * 60)
        
        # Run test suites
        self.test_shipments_endpoints()
        self.test_tracking_requests_endpoints()
        self.test_containers_endpoints()
        self.test_webhook_endpoints()
        self.test_reference_data_endpoints()
        self.test_error_scenarios()
        self.test_pagination_and_filtering()
        
        # Generate summary
        self.generate_summary_report()
        
        self.log("\n" + "=" * 60)
        self.log("Testing complete! Check api-responses/ directory for results.")


if __name__ == "__main__":
    tester = APITester()
    tester.run_all_tests()