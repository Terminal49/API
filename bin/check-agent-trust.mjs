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

function checkFeatureMap() {
  const featureMap = readJson('skills/agent-trust/feature-map.json');
  const serverPath = resolve(root, 'packages/mcp/src/server.ts');
  const registeredTools = [];
  const toolImports = new Map();
  const registeredImplementations = new Map();
  const program = ts.createProgram([serverPath], {
    noResolve: true,
    noLib: true,
  });
  const sourceFile = program.getSourceFile(serverPath);
  if (!sourceFile) throw new Error('Missing MCP registration source');
  const checker = program.getTypeChecker();
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
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      throw new Error(
        `Unsupported MCP registerTool form at packages/mcp/src/server.ts:${line + 1}; call <receiver>.registerTool('<literal name>', ...) directly`,
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
        if (!name || !ts.isStringLiteralLike(name))
          throw new Error(
            'MCP registrations require supported literal tool names',
          );
        registeredTools.push(name.text);
        const implementations = new Set();
        function collectCalls(handler) {
          if (
            ts.isCallExpression(handler) &&
            ts.isIdentifier(handler.expression)
          ) {
            const implementation = toolImports.get(
              checker.getSymbolAtLocation(handler.expression),
            );
            if (implementation) implementations.add(implementation);
          }
          ts.forEachChild(handler, collectCalls);
        }
        if (node.arguments[2]) collectCalls(node.arguments[2]);
        registeredImplementations.set(name.text, implementations);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
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
      { cwd: root },
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
