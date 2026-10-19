#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  globSync,
  mkdtempSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const sdkRequire = createRequire(
  new URL('../sdks/typescript-sdk/package.json', import.meta.url),
);
const ts = sdkRequire('typescript');

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function normalizedVersion(version) {
  return version.replace(/^=/, '');
}

function assertEqual(label, actual, expected) {
  const actualJson = JSON.stringify(sorted(actual));
  const expectedJson = JSON.stringify(sorted(expected));
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label} drifted.\nExpected: ${expectedJson}\nActual:   ${actualJson}`,
    );
  }
}

export function collectDocsRoutes(navigation) {
  function pages(value) {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(pages);
    if (value && typeof value === 'object') {
      return [...pages(value.pages), ...pages(value.groups)];
    }
    return [];
  }
  return (navigation.tabs ?? []).flatMap((tab) => {
    if (tab.tab === 'MCP') return pages(tab);
    if (tab.tab === 'SDK Docs') {
      return pages(tab).filter((route) => !route.startsWith('sdk/reference/'));
    }
    return [];
  });
}

export function checkSdkEntrypoints(sdkEntrypoints, sdkExports) {
  assertEqual(
    'SDK entrypoint map',
    sdkEntrypoints.map((entry) => entry.export),
    Object.keys(sdkExports),
  );
  for (const entry of sdkEntrypoints) {
    const sourcePath = entry.source.match(
      /^sdks\/typescript-sdk\/src\/(.+)\.ts$/,
    )?.[1];
    if (
      !sourcePath ||
      entry.source.endsWith('.d.ts') ||
      /[\\%#?]/.test(sourcePath) ||
      sourcePath
        .split('/')
        .some((segment) =>
          ['', '.', '..', 'node_modules'].includes(segment.toLowerCase()),
        )
    ) {
      throw new Error(
        'SDK entrypoint source must be a canonical .ts path under sdks/typescript-sdk/src',
      );
    }

    const targets = {
      types: `./dist/${sourcePath}.d.ts`,
      default: `./dist/${sourcePath}.js`,
    };
    const packageExport = sdkExports[entry.export];
    assertEqual(
      `SDK export ${entry.export} conditions`,
      Object.keys(packageExport),
      Object.keys(targets),
    );
    for (const [condition, target] of Object.entries(targets)) {
      if (packageExport[condition] !== target) {
        throw new Error(
          `SDK export ${entry.export} ${condition} must target ${target}; received ${packageExport[condition]}`,
        );
      }
    }
  }
}

function checkSdkEmission(sdkEntrypoints, sdkExports) {
  if (sdkEntrypoints.length === 0) return;
  const sdkRoot = resolve(root, 'sdks/typescript-sdk');
  const config = ts.readConfigFile(
    resolve(sdkRoot, 'tsconfig.json'),
    ts.sys.readFile,
  );
  if (config.error)
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, '\n'),
    );
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, sdkRoot);
  if (parsed.errors.length > 0) {
    throw new Error(
      ts.formatDiagnostics(parsed.errors, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => '\n',
      }),
    );
  }
  if (parsed.options.outDir !== resolve(sdkRoot, 'dist')) {
    throw new Error('SDK export targets ./dist require compiler outDir ./dist');
  }
  if (parsed.options.outFile || parsed.options.declarationDir) {
    throw new Error(
      'SDK emission verification requires per-file outputs in the configured outDir',
    );
  }
  const temporary = mkdtempSync(join(tmpdir(), 'sdk-export-emission-'));
  try {
    const options = { ...parsed.options };
    if (options.incremental || options.composite)
      options.tsBuildInfoFile = join(temporary, 'build.tsbuildinfo');
    const program = ts.createProgram(parsed.fileNames, options);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const emitted = program.emit(
      undefined,
      (filename, data, writeByteOrderMark) => {
        if (resolve(filename) === options.tsBuildInfoFile) return;
        const outputPath = relative(parsed.options.outDir, resolve(filename));
        if (outputPath.startsWith('..') || isAbsolute(outputPath)) {
          throw new Error(
            `SDK compiler output escaped configured dist: ${filename}`,
          );
        }
        const output = resolve(temporary, outputPath);
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, `${writeByteOrderMark ? '\ufeff' : ''}${data}`);
      },
    );
    diagnostics.push(...emitted.diagnostics);
    if (diagnostics.length > 0) {
      throw new Error(
        ts.formatDiagnostics(diagnostics, {
          getCanonicalFileName: (file) => file,
          getCurrentDirectory: () => root,
          getNewLine: () => '\n',
        }),
      );
    }
    for (const entry of sdkEntrypoints) {
      for (const target of Object.values(sdkExports[entry.export])) {
        const output = resolve(temporary, target.slice('./dist/'.length));
        if (!existsSync(output))
          throw new Error(
            `SDK export ${entry.export} target ${target} was not emitted`,
          );
      }
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function parseSource(path) {
  const absolute = resolve(root, path);
  const program = ts.createProgram([absolute], {
    noResolve: true,
    noLib: true,
  });
  const sourceFile = program.getSourceFile(absolute);
  return { sourceFile, checker: program.getTypeChecker() };
}

function sourceLine(sourceFile, path, node) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return `${path}:${line + 1}`;
}

function unwrapExpression(node) {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isAsExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

function enclosingDeclaration(expression) {
  let node = expression;
  while (
    (ts.isParenthesizedExpression(node.parent) ||
      ts.isSatisfiesExpression(node.parent) ||
      ts.isAsExpression(node.parent)) &&
    node.parent.expression === node
  ) {
    node = node.parent;
  }
  return ts.isVariableDeclaration(node.parent) &&
    node.parent.initializer === node &&
    ts.isIdentifier(node.parent.name) &&
    node.parent.parent.flags & ts.NodeFlags.Const
    ? node.parent
    : undefined;
}

function literalPropertyName(name) {
  return name && (ts.isIdentifier(name) || ts.isStringLiteralLike(name))
    ? name.text
    : null;
}

const registryPath = 'packages/mcp/src/tools/registry.ts';
// ./tools/ modules a registrar may call besides its handler. None implements a
// tool, so adding one here is a reviewed change to this guard.
const registrarSupportModules = new Set(['packages/mcp/src/tools/context.ts']);

// readTool(name, ...) entries are trusted to register `name` only after its
// body is shown to return an object whose sole `name` is that first parameter.
function verifiedReadTool(sourceFile, checker) {
  const helpers = sourceFile.statements.filter(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'readTool',
  );
  const [helper] = helpers;
  const [statement] = helper?.body?.statements ?? [];
  const [parameter] = helper?.parameters ?? [];
  const returned =
    helper?.body?.statements.length === 1 &&
    ts.isReturnStatement(statement) &&
    statement.expression &&
    unwrapExpression(statement.expression);
  const properties =
    returned && ts.isObjectLiteralExpression(returned)
      ? returned.properties
      : [];
  const names = properties.filter(
    (property) => literalPropertyName(property.name) === 'name',
  );
  const [name] = names;
  const nameSymbol =
    name && ts.isShorthandPropertyAssignment(name)
      ? checker.getShorthandAssignmentValueSymbol(name)
      : name && ts.isIdentifier(name.initializer)
        ? checker.getSymbolAtLocation(name.initializer)
        : undefined;
  if (
    helpers.length !== 1 ||
    !parameter ||
    !ts.isIdentifier(parameter.name) ||
    properties.length === 0 ||
    !properties.every(
      (property) =>
        (ts.isPropertyAssignment(property) ||
          ts.isShorthandPropertyAssignment(property)) &&
        literalPropertyName(property.name) !== null,
    ) ||
    names.length !== 1 ||
    !nameSymbol ||
    nameSymbol !== checker.getSymbolAtLocation(parameter.name)
  )
    throw new Error(
      `${registryPath} must declare function readTool(name, ...) once, returning an object literal whose only name property is name`,
    );
  return helper;
}

// The server dispatches only what selectTools returns, so selectTools must
// derive its result from TOOL_REGISTRY rather than return its own list.
function verifySelectTools(sourceFile, checker, registryDeclaration) {
  const helpers = sourceFile.statements.filter(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'selectTools',
  );
  const [helper] = helpers;
  const [statement] = helper?.body?.statements ?? [];
  const returned =
    statement && ts.isReturnStatement(statement) && statement.expression
      ? unwrapExpression(statement.expression)
      : undefined;
  const filtered =
    returned && ts.isCallExpression(returned) ? returned.expression : undefined;
  if (
    helpers.length !== 1 ||
    !helper.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ) ||
    helper.body.statements.length !== 1 ||
    !filtered ||
    !ts.isPropertyAccessExpression(filtered) ||
    filtered.name.text !== 'filter' ||
    !ts.isIdentifier(filtered.expression) ||
    checker.getSymbolAtLocation(filtered.expression)?.valueDeclaration !==
      registryDeclaration
  )
    throw new Error(
      `${registryPath} must declare export function selectTools(selection) once, returning TOOL_REGISTRY.filter(...)`,
    );
}

function collectRegistryToolNames() {
  if (!existsSync(resolve(root, registryPath))) return [];
  const { sourceFile, checker } = parseSource(registryPath);
  const at = (node) => sourceLine(sourceFile, registryPath, node);
  const declarations = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .filter(
      (declaration) =>
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === 'TOOL_REGISTRY',
    );
  if (declarations.length !== 1)
    throw new Error(`${registryPath} must declare TOOL_REGISTRY exactly once`);
  const registry = unwrapExpression(declarations[0].initializer);
  if (!ts.isArrayLiteralExpression(registry))
    throw new Error(
      `TOOL_REGISTRY at ${at(declarations[0])} must be an array literal`,
    );
  if (registry.elements.length === 0)
    throw new Error(
      `${registryPath} declares an empty TOOL_REGISTRY; declare every MCP tool in it`,
    );
  verifySelectTools(sourceFile, checker, declarations[0]);
  let readTool;
  return registry.elements.map((entry) => {
    if (
      ts.isCallExpression(entry) &&
      ts.isIdentifier(entry.expression) &&
      entry.expression.text === 'readTool' &&
      checker.getSymbolAtLocation(entry.expression)?.valueDeclaration ===
        (readTool ??= verifiedReadTool(sourceFile, checker))
    ) {
      const [name] = entry.arguments;
      if (name && ts.isStringLiteralLike(name)) return name.text;
    }
    // Every property needs a literal key, so no spread, shorthand, or
    // computed key can replace the checked name.
    if (
      ts.isObjectLiteralExpression(entry) &&
      entry.properties.every(
        (property) =>
          ts.isPropertyAssignment(property) &&
          literalPropertyName(property.name) !== null,
      )
    ) {
      const names = entry.properties.filter(
        (property) => literalPropertyName(property.name) === 'name',
      );
      if (names.length === 1 && ts.isStringLiteralLike(names[0].initializer))
        return names[0].initializer.text;
    }
    throw new Error(
      `Unsupported MCP tool registry entry at ${at(entry)}; declare each tool with a literal name`,
    );
  });
}

function checkFeatureMap() {
  const featureMap = readJson('skills/agent-trust/feature-map.json');
  const serverPath = 'packages/mcp/src/server.ts';
  const registeredTools = [];
  const toolImports = new Map();
  const registeredImplementations = new Map();
  const registryTools = collectRegistryToolNames();
  const { sourceFile, checker } = parseSource(serverPath);
  if (!sourceFile) throw new Error('Missing MCP registration source');
  const at = (node) => sourceLine(sourceFile, serverPath, node);
  function isSelectToolsCall(node) {
    const call = node && unwrapExpression(node);
    if (
      !call ||
      !ts.isCallExpression(call) ||
      !ts.isIdentifier(call.expression)
    )
      return false;
    const [specifier] =
      checker.getSymbolAtLocation(call.expression)?.declarations ?? [];
    const declaration = specifier?.parent?.parent?.parent;
    return (
      !!specifier &&
      ts.isImportSpecifier(specifier) &&
      !specifier.isTypeOnly &&
      (specifier.propertyName ?? specifier.name).text === 'selectTools' &&
      ts.isImportDeclaration(declaration) &&
      !declaration.importClause?.isTypeOnly &&
      declaration.moduleSpecifier.text === './tools/registry.js'
    );
  }
  // The loop must iterate selectTools(...) or a const bound to it, so the
  // toolset and read-only selection decides what gets registered.
  function iteratesRegistrySelection(iterable) {
    const expression = unwrapExpression(iterable);
    if (isSelectToolsCall(expression)) return true;
    if (!ts.isIdentifier(expression)) return false;
    const declaration =
      checker.getSymbolAtLocation(expression)?.valueDeclaration;
    return (
      !!declaration &&
      ts.isVariableDeclaration(declaration) &&
      ts.isVariableDeclarationList(declaration.parent) &&
      (declaration.parent.flags & ts.NodeFlags.Const) !== 0 &&
      isSelectToolsCall(declaration.initializer)
    );
  }
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier)
    )
      continue;
    const modulePath = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;
    if (
      statement.importClause?.isTypeOnly ||
      !modulePath.startsWith('./tools/') ||
      !bindings ||
      !ts.isNamedImports(bindings)
    )
      continue;
    for (const binding of bindings.elements) {
      if (!binding.isTypeOnly) {
        const symbol = checker.getSymbolAtLocation(binding.name);
        if (!symbol) throw new Error('Unresolved MCP handler import');
        toolImports.set(
          symbol,
          `packages/mcp/src/${modulePath.slice(2).replace(/\.js$/, '.ts')}`,
        );
      }
    }
  }
  function isRegistrationCallee(member) {
    return (
      ts.isCallExpression(member.parent) && member.parent.expression === member
    );
  }
  function handlerImplementations(handler) {
    const implementations = new Set();
    function collectCalls(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const implementation = toolImports.get(
          checker.getSymbolAtLocation(node.expression),
        );
        if (implementation) implementations.add(implementation);
      }
      ts.forEachChild(node, collectCalls);
    }
    if (handler) collectCalls(handler);
    return implementations;
  }
  function addTool(name, implementations) {
    if (registeredImplementations.has(name))
      throw new Error(`Duplicate MCP tool registration: ${name}`);
    registeredTools.push(name);
    registeredImplementations.set(name, implementations);
  }
  function returnedFunction(factory) {
    let body = factory.body;
    if (body && ts.isBlock(body)) {
      const [statement] = body.statements;
      body =
        body.statements.length === 1 && ts.isReturnStatement(statement)
          ? statement.expression
          : undefined;
    }
    body = body && unwrapExpression(body);
    return body && (ts.isArrowFunction(body) || ts.isFunctionExpression(body))
      ? body
      : undefined;
  }
  // A registerTool call whose name is `<definition>.name` is accepted only as
  // the body of a `const <registrar> = (spec, handler) => (definition) => ...`
  // factory. Its tool names come from the handler map's literal keys.
  function registrarFor(call, name) {
    const unsupported = () =>
      new Error(
        `MCP registrations require supported literal tool names at ${at(call)}; pass a literal name, or register through const <registrar> = (spec, handler) => (definition) => <receiver>.registerTool(definition.name, ...)`,
      );
    if (
      !ts.isPropertyAccessExpression(name) ||
      name.name.text !== 'name' ||
      !ts.isIdentifier(name.expression)
    )
      throw unsupported();
    const enclosingFunction = (node) => {
      let current = node?.parent;
      while (current && !ts.isFunctionLike(current)) current = current.parent;
      return current;
    };
    const registrar = enclosingFunction(call);
    const factory = enclosingFunction(registrar);
    const declaration = factory && enclosingDeclaration(factory);
    const [definition] = registrar?.parameters ?? [];
    if (
      !registrar ||
      registrar.parameters.length !== 1 ||
      !ts.isIdentifier(definition.name) ||
      checker.getSymbolAtLocation(definition.name) !==
        checker.getSymbolAtLocation(name.expression) ||
      !(ts.isArrowFunction(factory) || ts.isFunctionExpression(factory)) ||
      returnedFunction(factory) !== registrar ||
      !declaration
    )
      throw unsupported();
    checkForwardsHandler(factory, call, declaration);
    return checker.getSymbolAtLocation(declaration.name);
  }
  // The handler map's second argument is the tool's implementation only if the
  // registrar hands that argument, and nothing else from ./tools/, to
  // registerTool's callback.
  function checkForwardsHandler(factory, call, declaration) {
    const handler = factory.parameters[1]?.name;
    const callback = call.arguments[2];
    const uses = [];
    function find(node) {
      if (
        ts.isIdentifier(node) &&
        node !== handler &&
        checker.getSymbolAtLocation(node) ===
          checker.getSymbolAtLocation(handler)
      )
        uses.push(node);
      ts.forEachChild(node, find);
    }
    if (handler && ts.isIdentifier(handler)) find(factory.body);
    const forwarded = (use) =>
      use.pos >= callback.pos &&
      use.end <= callback.end &&
      ts.isCallExpression(use.parent) &&
      (use.parent.expression === use || use.parent.arguments.includes(use));
    const implementations = [...handlerImplementations(factory)].filter(
      (module) => !registrarSupportModules.has(module),
    );
    if (
      !callback ||
      uses.length === 0 ||
      !uses.every(forwarded) ||
      implementations.length > 0
    )
      throw new Error(
        `MCP tool registrar ${declaration.name.text} at ${at(call)} must pass its handler parameter, and no tool implementation, to registerTool's callback`,
      );
  }
  let registrar;
  const literalRegistrations = [];
  function visit(node) {
    if (
      (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) &&
      node.text === 'registerTool' &&
      !(
        (ts.isPropertyAccessExpression(node.parent) &&
          node.parent.name === node &&
          isRegistrationCallee(node.parent)) ||
        (ts.isElementAccessExpression(node.parent) &&
          node.parent.argumentExpression === node &&
          isRegistrationCallee(node.parent))
      )
    ) {
      throw new Error(
        `Unsupported MCP registerTool form at ${at(node)}; call <receiver>.registerTool('<literal name>', ...) directly`,
      );
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const method = ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : ts.isElementAccessExpression(expression) &&
            ts.isStringLiteralLike(expression.argumentExpression)
          ? expression.argumentExpression.text
          : null;
      if (method === 'registerTool') {
        const name = node.arguments[0];
        if (name && ts.isStringLiteralLike(name)) {
          addTool(name.text, handlerImplementations(node.arguments[2]));
          literalRegistrations.push(name);
        } else {
          const found = registrarFor(node, name ?? node);
          if (registrar)
            throw new Error(
              `A second MCP tool registrar at ${at(node)}; register every tool through one registrar`,
            );
          registrar = found;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  const handlerMapTools = [];
  if (registrar) {
    const [registrarDeclaration] = registrar.declarations;
    let handlerMap;
    function references(symbol, declarationName, check) {
      function find(node) {
        if (
          ts.isIdentifier(node) &&
          node !== declarationName &&
          checker.getSymbolAtLocation(node) === symbol
        )
          check(node);
        ts.forEachChild(node, find);
      }
      find(sourceFile);
    }
    references(registrar, registrarDeclaration.name, (reference) => {
      const call = reference.parent;
      const property = call.parent;
      const map = property?.parent;
      if (
        !ts.isCallExpression(call) ||
        call.expression !== reference ||
        !ts.isPropertyAssignment(property) ||
        property.initializer !== call ||
        literalPropertyName(property.name) === null ||
        !enclosingDeclaration(map) ||
        (handlerMap && handlerMap !== map)
      )
        throw new Error(
          `MCP tool registrar ${registrarDeclaration.name.text} at ${at(reference)} must only be called as a literal-keyed property value of one const handler map`,
        );
      handlerMap = map;
    });
    if (!handlerMap)
      throw new Error(
        `MCP tool registrar ${registrarDeclaration.name.text} is never placed in a handler map`,
      );
    for (const property of handlerMap.properties) {
      const call = ts.isPropertyAssignment(property)
        ? property.initializer
        : undefined;
      if (
        !call ||
        literalPropertyName(property.name) === null ||
        !ts.isCallExpression(call) ||
        !ts.isIdentifier(call.expression) ||
        checker.getSymbolAtLocation(call.expression) !== registrar
      )
        throw new Error(
          `MCP handler map entry at ${at(property)} must be '<literal tool name>': ${registrarDeclaration.name.text}(spec, handler)`,
        );
      const name = literalPropertyName(property.name);
      handlerMapTools.push(name);
      addTool(name, handlerImplementations(call.arguments[1]));
    }
    const mapDeclaration = enclosingDeclaration(handlerMap);
    let dispatches = 0;
    references(
      checker.getSymbolAtLocation(mapDeclaration.name),
      mapDeclaration.name,
      (reference) => {
        const access = reference.parent;
        const call = access.parent;
        const key = ts.isElementAccessExpression(access)
          ? access.argumentExpression
          : undefined;
        const [definition] = ts.isCallExpression(call) ? call.arguments : [];
        if (
          !key ||
          access.expression !== reference ||
          call.expression !== access ||
          call.arguments.length !== 1 ||
          !ts.isPropertyAccessExpression(key) ||
          key.name.text !== 'name' ||
          !ts.isIdentifier(key.expression) ||
          !ts.isIdentifier(definition) ||
          checker.getSymbolAtLocation(key.expression) !==
            checker.getSymbolAtLocation(definition)
        )
          throw new Error(
            `MCP handler map ${mapDeclaration.name.text} at ${at(reference)} must only be dispatched as ${mapDeclaration.name.text}[definition.name](definition)`,
          );
        const statement = call.parent;
        const loop = ts.isBlock(statement.parent)
          ? statement.parent.parent
          : statement.parent;
        const [loopVariable] = ts.isForOfStatement(loop)
          ? (loop.initializer.declarations ?? [])
          : [];
        if (
          !ts.isExpressionStatement(statement) ||
          !ts.isForOfStatement(loop) ||
          (ts.isBlock(statement.parent) &&
            loop.statement !== statement.parent) ||
          !loopVariable ||
          !ts.isIdentifier(loopVariable.name) ||
          checker.getSymbolAtLocation(loopVariable.name) !==
            checker.getSymbolAtLocation(definition)
        )
          throw dispatchRequired();
        if (!iteratesRegistrySelection(loop.expression))
          throw new Error(
            `MCP handler map ${mapDeclaration.name.text} at ${at(loop.expression)} must iterate the selectTools(...) result imported from ./tools/registry.js`,
          );
        dispatches += 1;
      },
    );
    if (dispatches === 0) throw dispatchRequired();
    function dispatchRequired() {
      const map = mapDeclaration.name.text;
      return new Error(
        `MCP handler map ${map} must be dispatched as for (const definition of ...) ${map}[definition.name](definition)`,
      );
    }
  }
  const [literal] = literalRegistrations;
  if (literal && existsSync(resolve(root, registryPath)))
    throw new Error(
      `MCP tool ${literal.text} at ${at(literal)} bypasses TOOL_REGISTRY; register every tool through the registry handler map`,
    );
  assertEqual(
    'MCP tool registry against the server handler map',
    registryTools,
    handlerMapTools,
  );
  assertEqual(
    'MCP feature map',
    featureMap.mcpTools.map((tool) => tool.name),
    registeredTools,
  );

  for (const tool of featureMap.mcpTools) {
    assertEqual(
      `MCP implementation for ${tool.name}`,
      [tool.implementation],
      [...(registeredImplementations.get(tool.name) ?? [])],
    );

    if (!existsSync(resolve(root, tool.implementation))) {
      throw new Error(`Missing MCP implementation: ${tool.implementation}`);
    }
  }

  const sdkPackage = readJson('sdks/typescript-sdk/package.json');
  checkSdkEntrypoints(featureMap.sdkEntrypoints, sdkPackage.exports);
  for (const entry of featureMap.sdkEntrypoints) {
    if (!existsSync(resolve(root, entry.source))) {
      throw new Error(`Missing SDK entrypoint source: ${entry.source}`);
    }
  }

  checkSdkEmission(featureMap.sdkEntrypoints, sdkPackage.exports);

  const docsConfig = readJson('docs/docs.json');
  const docsRoutes = collectDocsRoutes(docsConfig.navigation);
  assertEqual('Docs route map', featureMap.docsRoutes, docsRoutes);
  for (const route of featureMap.docsRoutes) {
    if (!existsSync(resolve(root, `docs/${route}.mdx`))) {
      throw new Error(`Missing docs route source: docs/${route}.mdx`);
    }
  }
}

function workspaceManifests() {
  return sorted(
    globSync(
      readJson('package.json').workspaces.map(
        (workspace) => `${workspace}/package.json`,
      ),
      { cwd: root, exclude: ['**/node_modules/**'] },
    ),
  );
}

function checkToolchain() {
  const rootPackage = readJson('package.json');
  const vitePlusPackage = readJson('node_modules/vite-plus/package.json');
  const expected = vitePlusPackage.dependencies;
  const workspaces = workspaceManifests();

  if (rootPackage.devDependencies['vite-plus'] !== vitePlusPackage.version) {
    throw new Error(
      'Root vite-plus version does not match the installed tool.',
    );
  }
  if (
    rootPackage.devDependencies['@oxlint/plugins'] !==
    normalizedVersion(expected['@oxlint/plugins'])
  ) {
    throw new Error('@oxlint/plugins is not coupled to vite-plus.');
  }
  if (rootPackage.overrides.vitest !== expected.vitest) {
    throw new Error('Vitest override is not coupled to vite-plus.');
  }
  if (
    rootPackage.overrides.vite !==
    `npm:@voidzero-dev/vite-plus-core@${vitePlusPackage.version}`
  ) {
    throw new Error('Vite core override is not coupled to vite-plus.');
  }

  const workspaceNames = [];
  const workspacePackages = [];
  for (const workspacePath of workspaces) {
    const workspace = readJson(workspacePath);
    workspaceNames.push(workspace.name);
    workspacePackages.push(workspace);
    if (workspace.devDependencies['vite-plus'] !== vitePlusPackage.version) {
      throw new Error(`${workspacePath} has a mismatched vite-plus version.`);
    }
    if (workspace.devDependencies['@vitest/coverage-v8'] !== expected.vitest) {
      throw new Error(
        `${workspacePath} has a mismatched Vitest coverage version.`,
      );
    }
  }
  const buildTargets = (rootPackage.scripts?.build ?? '')
    .split('&&')
    .map((command) => {
      const target = command
        .trim()
        .match(/^npm run build --workspace (\S+)$/)?.[1];
      if (!target)
        throw new Error(
          'Root build must use ordered npm workspace build commands',
        );
      return target;
    });
  assertEqual('Workspace build inventory', buildTargets, workspaceNames);
  const buildPosition = new Map(
    buildTargets.map((name, position) => [name, position]),
  );
  for (const workspace of workspacePackages) {
    const dependencies = {
      ...workspace.dependencies,
      ...workspace.devDependencies,
      ...workspace.optionalDependencies,
      ...workspace.peerDependencies,
    };
    for (const dependency of Object.keys(dependencies)) {
      if (
        buildPosition.has(dependency) &&
        buildPosition.get(dependency) >= buildPosition.get(workspace.name)
      ) {
        throw new Error(
          `Root build must build ${dependency} before ${workspace.name}`,
        );
      }
    }
  }
}

function checkConfigOwnership() {
  const sourceFiles = execFileSync(
    'git',
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      ...workspaceManifests().map(dirname),
    ],
    { cwd: root, encoding: 'utf8' },
  ).split('\0');
  const nestedConfigs = sorted(
    sourceFiles.filter((path) =>
      /(?:^|\/)vite\.config\.[cm]?[jt]s$/.test(path),
    ),
  );
  if (nestedConfigs.length > 0) {
    throw new Error(
      `Workspace Vite configs are not allowed: ${nestedConfigs.join(', ')}`,
    );
  }
}

if (import.meta.main) {
  try {
    checkFeatureMap();
    checkToolchain();
    checkConfigOwnership();
    console.log('PASS agent trust guards');
  } catch (error) {
    console.error(
      `FAIL agent trust guards: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
