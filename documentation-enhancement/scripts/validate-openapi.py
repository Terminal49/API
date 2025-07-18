#!/usr/bin/env python3
"""
Validate enhanced OpenAPI specification for errors and consistency
"""

import json
import yaml
import sys
from pathlib import Path
from typing import Dict, List, Any, Set
from collections import defaultdict

try:
    from jsonschema import validate, ValidationError, RefResolver
    from openapi_spec_validator import validate_spec
    from openapi_spec_validator.exceptions import OpenAPIValidationError
except ImportError:
    print("Please install required packages:")
    print("pip install jsonschema openapi-spec-validator pyyaml")
    sys.exit(1)

class OpenAPIValidator:
    def __init__(self, spec_path: str):
        """Initialize validator with OpenAPI spec path"""
        self.spec_path = Path(spec_path)
        self.errors = []
        self.warnings = []
        
        # Load spec
        with open(self.spec_path, 'r') as f:
            if self.spec_path.suffix == '.json':
                self.spec = json.load(f)
            else:
                self.spec = yaml.safe_load(f)
    
    def validate(self) -> bool:
        """Run all validation checks"""
        print(f"Validating OpenAPI spec: {self.spec_path}")
        print("=" * 60)
        
        # Run validation checks
        self._validate_openapi_schema()
        self._validate_references()
        self._validate_examples()
        self._validate_parameters()
        self._validate_responses()
        self._validate_schemas()
        self._check_best_practices()
        
        # Report results
        self._print_report()
        
        return len(self.errors) == 0
    
    def _validate_openapi_schema(self):
        """Validate against OpenAPI 3.0 schema"""
        print("\n1. Validating OpenAPI schema compliance...")
        
        try:
            validate_spec(self.spec)
            print("   ✓ Valid OpenAPI 3.0 specification")
        except OpenAPIValidationError as e:
            self.errors.append(f"OpenAPI schema validation failed: {str(e)}")
            print(f"   ✗ {str(e)}")
        except Exception as e:
            self.errors.append(f"Unexpected error during schema validation: {str(e)}")
            print(f"   ✗ Unexpected error: {str(e)}")
    
    def _validate_references(self):
        """Validate all $ref references resolve correctly"""
        print("\n2. Validating references...")
        
        refs = self._find_refs(self.spec)
        resolver = RefResolver(base_uri='', referrer=self.spec)
        
        invalid_refs = []
        for ref in refs:
            try:
                resolver.resolve(ref)
            except Exception:
                invalid_refs.append(ref)
        
        if invalid_refs:
            self.errors.append(f"Invalid references found: {invalid_refs}")
            print(f"   ✗ {len(invalid_refs)} invalid references")
        else:
            print(f"   ✓ All {len(refs)} references valid")
    
    def _find_refs(self, obj: Any, refs: Set[str] = None) -> Set[str]:
        """Recursively find all $ref values"""
        if refs is None:
            refs = set()
        
        if isinstance(obj, dict):
            if '$ref' in obj:
                refs.add(obj['$ref'])
            for value in obj.values():
                self._find_refs(value, refs)
        elif isinstance(obj, list):
            for item in obj:
                self._find_refs(item, refs)
        
        return refs
    
    def _validate_examples(self):
        """Validate all examples against their schemas"""
        print("\n3. Validating examples...")
        
        examples_validated = 0
        examples_failed = []
        
        # Check request body examples
        for path, methods in self.spec.get('paths', {}).items():
            for method, operation in methods.items():
                if method in ['get', 'post', 'put', 'patch', 'delete']:
                    # Check request examples
                    if 'requestBody' in operation:
                        content = operation['requestBody'].get('content', {})
                        for media_type, media_obj in content.items():
                            if 'examples' in media_obj and 'schema' in media_obj:
                                schema = self._resolve_schema(media_obj['schema'])
                                for example_name, example in media_obj['examples'].items():
                                    try:
                                        validate(example.get('value'), schema)
                                        examples_validated += 1
                                    except ValidationError as e:
                                        examples_failed.append({
                                            'path': path,
                                            'method': method,
                                            'example': example_name,
                                            'error': str(e)
                                        })
                    
                    # Check response examples
                    for status, response in operation.get('responses', {}).items():
                        content = response.get('content', {})
                        for media_type, media_obj in content.items():
                            if 'examples' in media_obj and 'schema' in media_obj:
                                schema = self._resolve_schema(media_obj['schema'])
                                for example_name, example in media_obj['examples'].items():
                                    try:
                                        validate(example.get('value'), schema)
                                        examples_validated += 1
                                    except ValidationError as e:
                                        examples_failed.append({
                                            'path': path,
                                            'method': method,
                                            'status': status,
                                            'example': example_name,
                                            'error': str(e)
                                        })
        
        if examples_failed:
            self.errors.append(f"{len(examples_failed)} examples failed validation")
            print(f"   ✗ {len(examples_failed)} examples failed validation")
            for failure in examples_failed[:3]:  # Show first 3
                print(f"      - {failure['path']} {failure['method']}: {failure['example']}")
        else:
            print(f"   ✓ All {examples_validated} examples valid")
    
    def _resolve_schema(self, schema_obj: Dict) -> Dict:
        """Resolve a schema that might contain $ref"""
        if '$ref' in schema_obj:
            ref_path = schema_obj['$ref'].split('/')
            resolved = self.spec
            for part in ref_path:
                if part and part != '#':
                    resolved = resolved.get(part, {})
            return resolved
        return schema_obj
    
    def _validate_parameters(self):
        """Validate parameter definitions"""
        print("\n4. Validating parameters...")
        
        issues = []
        param_count = 0
        
        for path, methods in self.spec.get('paths', {}).items():
            for method, operation in methods.items():
                if method in ['get', 'post', 'put', 'patch', 'delete']:
                    for param in operation.get('parameters', []):
                        param_count += 1
                        
                        # Check required fields
                        if 'name' not in param:
                            issues.append(f"{path} {method}: parameter missing 'name'")
                        if 'in' not in param:
                            issues.append(f"{path} {method}: parameter missing 'in'")
                        
                        # Check for description
                        if 'description' not in param:
                            self.warnings.append(f"{path} {method}: parameter '{param.get('name')}' missing description")
                        
                        # Check for examples
                        if 'examples' not in param and 'example' not in param:
                            self.warnings.append(f"{path} {method}: parameter '{param.get('name')}' missing examples")
        
        if issues:
            self.errors.extend(issues)
            print(f"   ✗ {len(issues)} parameter errors")
        else:
            print(f"   ✓ All {param_count} parameters valid")
    
    def _validate_responses(self):
        """Validate response definitions"""
        print("\n5. Validating responses...")
        
        issues = []
        response_count = 0
        
        for path, methods in self.spec.get('paths', {}).items():
            for method, operation in methods.items():
                if method in ['get', 'post', 'put', 'patch', 'delete']:
                    responses = operation.get('responses', {})
                    
                    if not responses:
                        issues.append(f"{path} {method}: no responses defined")
                        continue
                    
                    for status, response in responses.items():
                        response_count += 1
                        
                        # Check for description
                        if 'description' not in response:
                            issues.append(f"{path} {method} {status}: missing description")
                        
                        # Check for content
                        if status != '204' and 'content' not in response:
                            self.warnings.append(f"{path} {method} {status}: no content defined")
        
        if issues:
            self.errors.extend(issues)
            print(f"   ✗ {len(issues)} response errors")
        else:
            print(f"   ✓ All {response_count} responses valid")
    
    def _validate_schemas(self):
        """Validate schema definitions"""
        print("\n6. Validating schemas...")
        
        schemas = self.spec.get('components', {}).get('schemas', {})
        issues = []
        
        for schema_name, schema in schemas.items():
            # Check for description
            if 'description' not in schema and 'title' not in schema:
                self.warnings.append(f"Schema '{schema_name}' missing description")
            
            # Check properties have descriptions
            if 'properties' in schema:
                for prop_name, prop in schema['properties'].items():
                    if 'description' not in prop:
                        self.warnings.append(f"Schema '{schema_name}' property '{prop_name}' missing description")
        
        print(f"   ✓ Validated {len(schemas)} schemas")
    
    def _check_best_practices(self):
        """Check for API documentation best practices"""
        print("\n7. Checking best practices...")
        
        # Check for API info
        info = self.spec.get('info', {})
        if 'contact' not in info:
            self.warnings.append("API info missing contact information")
        if 'termsOfService' not in info:
            self.warnings.append("API info missing terms of service")
        
        # Check for security definitions
        if 'security' not in self.spec and 'components' in self.spec and 'securitySchemes' not in self.spec['components']:
            self.warnings.append("No security schemes defined")
        
        # Check for tags
        if 'tags' not in self.spec:
            self.warnings.append("No tags defined for organizing operations")
        
        # Check operations have summaries
        for path, methods in self.spec.get('paths', {}).items():
            for method, operation in methods.items():
                if method in ['get', 'post', 'put', 'patch', 'delete']:
                    if 'summary' not in operation:
                        self.warnings.append(f"{path} {method}: missing summary")
                    if 'operationId' not in operation:
                        self.warnings.append(f"{path} {method}: missing operationId")
        
        print("   ✓ Best practices checked")
    
    def _print_report(self):
        """Print validation report"""
        print("\n" + "=" * 60)
        print("VALIDATION REPORT")
        print("=" * 60)
        
        if not self.errors and not self.warnings:
            print("\n✅ OpenAPI specification is valid!")
            print("No errors or warnings found.")
        else:
            if self.errors:
                print(f"\n❌ ERRORS ({len(self.errors)}):")
                for i, error in enumerate(self.errors[:10], 1):
                    print(f"   {i}. {error}")
                if len(self.errors) > 10:
                    print(f"   ... and {len(self.errors) - 10} more errors")
            
            if self.warnings:
                print(f"\n⚠️  WARNINGS ({len(self.warnings)}):")
                for i, warning in enumerate(self.warnings[:10], 1):
                    print(f"   {i}. {warning}")
                if len(self.warnings) > 10:
                    print(f"   ... and {len(self.warnings) - 10} more warnings")
        
        print("\n" + "=" * 60)
        
        # Summary
        print(f"\nSummary:")
        print(f"  Errors: {len(self.errors)}")
        print(f"  Warnings: {len(self.warnings)}")
        print(f"  Status: {'PASSED' if len(self.errors) == 0 else 'FAILED'}")

def main():
    """Main execution function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Validate OpenAPI specification')
    parser.add_argument('spec', help='Path to OpenAPI spec (JSON or YAML)')
    parser.add_argument('--strict', action='store_true', help='Treat warnings as errors')
    
    args = parser.parse_args()
    
    # Validate spec
    validator = OpenAPIValidator(args.spec)
    is_valid = validator.validate()
    
    # Exit with appropriate code
    if not is_valid:
        sys.exit(1)
    elif args.strict and validator.warnings:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()