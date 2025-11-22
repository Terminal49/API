# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-22

### Added

- Initial release of Terminal49 TypeScript SDK
- Full support for all Terminal49 API endpoints:
  - Shipments (list, get, stop/resume tracking)
  - Containers (get, refresh, events, transport events, route)
  - Tracking Requests (create, get, list)
  - Webhooks (CRUD operations, notifications, IPs)
  - Ports, Terminals, Vessels, Shipping Lines, Parties, Metro Areas
- TypeScript-first design with full type safety
- Auto-generated types from OpenAPI specification
- JSON:API deserialization with JSONA
- Clean domain models for all resources
- Comprehensive error handling with Terminal49Error class
- Environment-based configuration
- Unit and integration test suites
- Full API documentation in README
- MCP (Model Context Protocol) support

### Features

- **Type Safety**: Fully typed with generated OpenAPI types
- **JSON:API Support**: Automatic handling of relationships and included resources
- **Ergonomic API**: Clean, simple functions for all endpoints
- **Well Tested**: Comprehensive test coverage
- **Modern Stack**: ES modules, TypeScript 5+, Node 18+

### Documentation

- Complete README with examples for all endpoints
- Contributing guidelines
- Integration test documentation
- JSDoc comments for all public APIs
