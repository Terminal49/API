#!/usr/bin/env python3
"""
Apply documentation enhancements to Terminal49 OpenAPI specification
"""

import json
import yaml
import copy
from typing import Dict, Any, List
from pathlib import Path

class OpenAPIEnhancer:
    def __init__(self, spec_path: str, enhancement_dir: str):
        """Initialize with paths to OpenAPI spec and enhancement files"""
        self.spec_path = Path(spec_path)
        self.enhancement_dir = Path(enhancement_dir)
        
        # Load original spec
        with open(self.spec_path, 'r') as f:
            self.spec = json.load(f)
        
        # Create enhanced copy
        self.enhanced_spec = copy.deepcopy(self.spec)
    
    def load_enhancements(self, endpoint_name: str) -> Dict[str, Any]:
        """Load enhancement file for a specific endpoint"""
        enhancement_file = self.enhancement_dir / f"{endpoint_name}.yaml"
        if not enhancement_file.exists():
            print(f"No enhancement file found for {endpoint_name}")
            return {}
        
        with open(enhancement_file, 'r') as f:
            return yaml.safe_load(f)
    
    def enhance_tracking_requests(self):
        """Apply enhancements to tracking requests endpoints"""
        print("Enhancing tracking requests endpoints...")
        
        enhancements = self.load_enhancements('tracking-requests')
        if not enhancements:
            return
        
        # Enhance POST /tracking_requests
        if '/tracking_requests' in self.enhanced_spec['paths']:
            post_endpoint = self.enhanced_spec['paths']['/tracking_requests']['post']
            
            # Update description
            if 'create' in enhancements['endpoint_descriptions']:
                post_endpoint['description'] = enhancements['endpoint_descriptions']['create']['description']
                post_endpoint['summary'] = enhancements['endpoint_descriptions']['create']['summary']
            
            # Add request examples
            if 'request_examples' in enhancements:
                if 'requestBody' not in post_endpoint:
                    post_endpoint['requestBody'] = {'content': {'application/json': {}}}
                
                post_endpoint['requestBody']['content']['application/json']['examples'] = \
                    enhancements['request_examples']
            
            # Add response examples
            if 'response_examples' in enhancements:
                for status_code, examples in enhancements['response_examples'].items():
                    status_str = str(status_code)
                    if status_str in post_endpoint['responses']:
                        if 'content' not in post_endpoint['responses'][status_str]:
                            post_endpoint['responses'][status_str]['content'] = {'application/json': {}}
                        
                        post_endpoint['responses'][status_str]['content']['application/json']['examples'] = examples
            
            # Add code samples
            if 'x_code_samples' in enhancements:
                post_endpoint['x-code-samples'] = enhancements['x_code_samples']
        
        # Enhance GET /tracking_requests
        if '/tracking_requests' in self.enhanced_spec['paths'] and 'get' in self.enhanced_spec['paths']['/tracking_requests']:
            get_endpoint = self.enhanced_spec['paths']['/tracking_requests']['get']
            
            # Update description
            if 'list' in enhancements['endpoint_descriptions']:
                get_endpoint['description'] = enhancements['endpoint_descriptions']['list']['description']
                get_endpoint['summary'] = enhancements['endpoint_descriptions']['list']['summary']
            
            # Enhance parameters
            if 'parameters' in enhancements:
                self._enhance_parameters(get_endpoint, enhancements['parameters'])
        
        # Enhance GET /tracking_requests/{id}
        if '/tracking_requests/{id}' in self.enhanced_spec['paths']:
            get_single = self.enhanced_spec['paths']['/tracking_requests/{id}']['get']
            
            if 'get' in enhancements['endpoint_descriptions']:
                get_single['description'] = enhancements['endpoint_descriptions']['get']['description']
                get_single['summary'] = enhancements['endpoint_descriptions']['get']['summary']
        
        # Enhance schema definitions
        if 'schema_enhancements' in enhancements and 'tracking_request' in enhancements['schema_enhancements']:
            self._enhance_schema('tracking_request', enhancements['schema_enhancements']['tracking_request'])
        
        print("✓ Tracking requests endpoints enhanced")
    
    def _enhance_parameters(self, endpoint: Dict, parameter_enhancements: List[Dict]):
        """Enhance endpoint parameters with descriptions and examples"""
        if 'parameters' not in endpoint:
            return
        
        # Create a map of enhancements by parameter name
        enhancement_map = {p['name']: p for p in parameter_enhancements}
        
        for param in endpoint['parameters']:
            param_name = param.get('name')
            if param_name in enhancement_map:
                enhancement = enhancement_map[param_name]
                
                # Add description
                if 'description' in enhancement:
                    param['description'] = enhancement['description']
                
                # Add schema enhancements
                if 'schema' in enhancement and 'schema' in param:
                    param['schema'].update(enhancement['schema'])
                
                # Add examples
                if 'examples' in enhancement:
                    param['examples'] = enhancement['examples']
    
    def _enhance_schema(self, schema_name: str, enhancements: Dict):
        """Enhance a schema definition in components"""
        if 'components' not in self.enhanced_spec:
            return
        
        if 'schemas' not in self.enhanced_spec['components']:
            return
        
        if schema_name not in self.enhanced_spec['components']['schemas']:
            return
        
        schema = self.enhanced_spec['components']['schemas'][schema_name]
        
        # Recursively enhance properties
        if 'properties' in enhancements and 'properties' in schema:
            self._enhance_properties(schema['properties'], enhancements['properties'])
    
    def _enhance_properties(self, properties: Dict, enhancements: Dict):
        """Recursively enhance property definitions"""
        for prop_name, prop_enhancement in enhancements.items():
            if prop_name in properties:
                # Add description
                if 'description' in prop_enhancement:
                    properties[prop_name]['description'] = prop_enhancement['description']
                
                # Add examples
                if 'examples' in prop_enhancement:
                    properties[prop_name]['examples'] = prop_enhancement['examples']
                
                # Add validation rules
                for key in ['minLength', 'maxLength', 'pattern', 'minimum', 'maximum']:
                    if key in prop_enhancement:
                        properties[prop_name][key] = prop_enhancement[key]
                
                # Recursively enhance nested properties
                if 'properties' in prop_enhancement and 'properties' in properties[prop_name]:
                    self._enhance_properties(
                        properties[prop_name]['properties'],
                        prop_enhancement['properties']
                    )
    
    def save_enhanced_spec(self, output_path: str):
        """Save the enhanced specification"""
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output, 'w') as f:
            json.dump(self.enhanced_spec, f, indent=2)
        
        print(f"Enhanced OpenAPI spec saved to: {output}")
    
    def generate_enhancement_report(self) -> Dict[str, Any]:
        """Generate a report of what was enhanced"""
        report = {
            "total_endpoints": 0,
            "enhanced_endpoints": 0,
            "enhancements_applied": []
        }
        
        # Count endpoints
        for path, methods in self.enhanced_spec['paths'].items():
            for method in ['get', 'post', 'put', 'patch', 'delete']:
                if method in methods:
                    report['total_endpoints'] += 1
        
        return report

def main():
    """Main execution function"""
    print("Terminal49 OpenAPI Enhancement Tool")
    print("===================================\n")
    
    # Initialize enhancer
    enhancer = OpenAPIEnhancer(
        spec_path='../../docs/openapi.json',
        enhancement_dir='../openapi-enhancements'
    )
    
    # Apply enhancements
    enhancer.enhance_tracking_requests()
    # Add more endpoints as we create enhancement files:
    # enhancer.enhance_containers()
    # enhancer.enhance_shipments()
    # enhancer.enhance_webhooks()
    
    # Save enhanced specification
    enhancer.save_enhanced_spec('../../docs/openapi-enhanced.json')
    
    # Generate report
    report = enhancer.generate_enhancement_report()
    print("\nEnhancement Report:")
    print(f"Total endpoints: {report['total_endpoints']}")
    print(f"Enhanced endpoints: {report['enhanced_endpoints']}")
    
    print("\n✅ OpenAPI enhancement complete!")

if __name__ == "__main__":
    main()