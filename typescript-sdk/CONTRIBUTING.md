# Contributing to Terminal49 TypeScript SDK

Thank you for your interest in contributing to the Terminal49 TypeScript SDK!

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Terminal49/typescript-sdk.git
   cd typescript-sdk
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env and add your Terminal49 API key
   ```

4. **Generate types**
   ```bash
   npm run generate:types
   ```

5. **Build the project**
   ```bash
   npm run build
   ```

## Development Workflow

### Making Changes

1. Create a new branch for your feature/fix
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the coding guidelines below

3. Add tests for your changes

4. Run the test suite
   ```bash
   npm test
   ```

5. Run type checking
   ```bash
   npm run typecheck
   ```

6. Commit your changes with a descriptive message
   ```bash
   git commit -m "feat: add support for new endpoint"
   ```

### Commit Message Convention

We follow conventional commits:

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Test changes
- `chore:` - Tooling/config changes
- `refactor:` - Code refactoring

### Coding Guidelines

1. **TypeScript**
   - Use TypeScript for all code
   - Maintain strict type safety
   - Avoid `any` types - use `unknown` if type is truly unknown

2. **Code Style**
   - Use 2 spaces for indentation
   - Use single quotes for strings
   - Use trailing commas in objects/arrays
   - Follow existing code patterns

3. **Naming Conventions**
   - Use camelCase for functions and variables
   - Use PascalCase for types and interfaces
   - Use descriptive names

4. **Documentation**
   - Add JSDoc comments for all public APIs
   - Update README for new features
   - Include code examples where appropriate

5. **Testing**
   - Write unit tests for all new functions
   - Add integration tests for new endpoints
   - Maintain or improve code coverage

## Testing

### Unit Tests

Unit tests are located in `tests/unit/` and test individual components:

```bash
npm test tests/unit
```

### Integration Tests

Integration tests are located in `tests/integration/` and test actual API calls:

```bash
# Requires valid API key in .env
npm test tests/integration
```

### Test Coverage

```bash
npm run test:coverage
```

## OpenAPI Type Generation

When the Terminal49 OpenAPI spec is updated:

1. Update `openapi/terminal49-openapi.json` with the latest spec
2. Regenerate types:
   ```bash
   npm run generate:types
   ```
3. Update domain models if new fields are added
4. Update mappers if needed
5. Add new MCP tools for new endpoints

## Project Architecture

### Layers

1. **OpenAPI Types** (`src/generated/`)
   - Auto-generated from OpenAPI spec
   - Never edit manually

2. **HTTP Client** (`src/http/`)
   - Handles API communication
   - Authentication
   - Error handling

3. **JSON:API Layer** (`src/jsonapi/`)
   - Deserializes JSON:API responses
   - Maps to domain models

4. **Domain Models** (`src/domain/`)
   - Clean TypeScript interfaces
   - No JSON:API complexity

5. **MCP Tools** (`src/mcp/tools/`)
   - High-level API functions
   - User-facing interface

### Adding a New Endpoint

1. Ensure it's in the OpenAPI spec
2. Regenerate types
3. Create domain model in `src/domain/`
4. Create mapper in `src/jsonapi/mappers/`
5. Create MCP tool in `src/mcp/tools/`
6. Export from `src/index.ts`
7. Add tests
8. Update documentation

## Pull Request Process

1. Update documentation
2. Add/update tests
3. Ensure all tests pass
4. Ensure type checking passes
5. Update CHANGELOG.md
6. Submit PR with clear description
7. Address review feedback

## Questions?

Feel free to open an issue for any questions or concerns!
