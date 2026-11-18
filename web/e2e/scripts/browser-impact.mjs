import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parseSync } from 'rolldown/utils';
import { selectAdditionalChangedSpecs } from './changed-specs.mjs';

// These files own application-wide behavior, not one route's composition.
const sharedFiles = new Set([
  'web/src/App.tsx',
  'web/src/main.tsx',
  'web/src/capacitorShell.ts',
  'web/src/pwa.ts',
  'web/src/theme.ts',
  'web/src/components/AppShell.tsx',
  'web/src/components/AppErrorBoundary.tsx',
  'web/src/client/apiConfiguration.ts',
  'web/src/client/apiRuntimeContext.tsx',
  'web/src/client/connectivity.ts',
  'web/src/client/queryIdentity.ts',
  'web/src/client/routes.ts',
  'web/src/client/sessionPersistence.ts',
  'web/src/client/signOutSession.ts',
  'web/src/client/spaceContext.ts',
  'web/src/client/productReadCache.ts',
  'web/src/client/nativeSessionStorage.ts',
]);

export function readBrowserImpact(repositoryRoot, inventory) {
  const config = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'web/e2e/test-impact.json'), 'utf8'),
  );
  const entries = config?.specs;
  if (config?.version !== 1 || !entries || Array.isArray(entries)) {
    throw new Error(
      'Browser impact inventory must contain version 1 and specs.',
    );
  }
  const known = new Set(inventory.inventoriedSpecs);
  if (
    Object.keys(entries).length !== known.size ||
    Object.keys(entries).some((name) => !known.has(name)) ||
    inventory.inventoriedSpecs.some((name) => !entries[name])
  ) {
    throw new Error(
      'Browser impact inventory must classify every current spec.',
    );
  }
  for (const [name, entry] of Object.entries(entries)) {
    if (
      !Array.isArray(entry?.roots) ||
      entry.roots.length === 0 ||
      (entry.always !== undefined && typeof entry.always !== 'boolean') ||
      (entry.always && !inventory.prSpecs.includes(name))
    ) {
      throw new Error(`Invalid browser impact entry: ${name}`);
    }
    for (const path of entry.roots) {
      if (
        typeof path !== 'string' ||
        !/^web\/(src|e2e\/fixtures)\/[a-zA-Z0-9_./-]+$/.test(path) ||
        path
          .split('/')
          .some((part) => !part || part === '.' || part === '..') ||
        !existsSync(resolve(repositoryRoot, path)) ||
        !statSync(resolve(repositoryRoot, path)).isFile()
      ) {
        throw new Error(`Invalid browser impact root for ${name}`);
      }
    }
  }
  if (!Object.values(entries).some((entry) => entry.always)) {
    throw new Error('Browser impact inventory requires an always-run core.');
  }
  return entries;
}

/** Follow actual module imports, including type imports, re-exports and CSS. */
export function createDependencyReader(repositoryRoot) {
  const cache = new Map();
  function dependencies(path) {
    if (cache.has(path)) return cache.get(path);
    const result = new Set([path]);
    // Cache direct edges only after successful parsing. Each root owns its
    // transitive visited set, so cycles and failed reads cannot hide edges.
    if (!/\.[cm]?[jt]sx?$/.test(path)) {
      cache.set(path, result);
      return result;
    }
    const source = readFileSync(resolve(repositoryRoot, path), 'utf8');
    const parsed = parseSync(path, source);
    if (parsed.errors.length)
      throw new Error(`Cannot parse dependency: ${path}`);
    const requests = [
      ...parsed.module.staticImports.map((item) => item.moduleRequest.value),
      ...parsed.module.staticExports.flatMap((item) =>
        item.entries.flatMap((entry) =>
          entry.moduleRequest ? [entry.moduleRequest.value] : [],
        ),
      ),
    ];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'ImportExpression') {
        if (
          node.source.type !== 'Literal' ||
          typeof node.source.value !== 'string'
        ) {
          // Browser-evaluated test callbacks receive module URLs as arguments.
          // Their production consumers are owned by the explicit entry roots;
          // these are not dynamic imports made by the product itself.
          if (path.startsWith('web/e2e/')) return;
          throw new Error(`Non-literal import in ${path}`);
        }
        requests.push(node.source.value);
      }
      if (
        node.type === 'CallExpression' &&
        (node.callee?.name === 'require' ||
          (node.callee?.type === 'MemberExpression' &&
            node.callee.object?.type === 'MetaProperty'))
      ) {
        throw new Error(`Unsupported dependency expression in ${path}`);
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      }
    }
    visit(parsed.program);
    for (const request of requests) {
      if (!request.startsWith('.')) {
        if (
          request.startsWith('@/') ||
          request.startsWith('~/') ||
          request.startsWith('#') ||
          request.startsWith('/')
        )
          throw new Error(`Unsupported import alias in ${path}`);
        continue; // Locked package changes select the full regression separately.
      }
      const candidate = resolve(repositoryRoot, dirname(path), request);
      const resolved = [
        candidate,
        ...['.ts', '.tsx', '.js', '.jsx', '.json'].map(
          (suffix) => candidate + suffix,
        ),
        ...['index.ts', 'index.tsx', 'index.js'].map((name) =>
          resolve(candidate, name),
        ),
      ].find((name) => existsSync(name) && statSync(name).isFile());
      if (!resolved) throw new Error(`Unresolved local import in ${path}`);
      const local = relative(repositoryRoot, resolved).replaceAll('\\', '/');
      if (local.startsWith('../'))
        throw new Error('Dependency outside repository');
      result.add(local);
    }
    cache.set(path, result);
    return result;
  }
  return (roots) => {
    const visited = new Set();
    const pending = [...roots];
    while (pending.length) {
      const path = pending.pop();
      if (visited.has(path)) continue;
      visited.add(path);
      for (const dependency of dependencies(path)) {
        if (!visited.has(dependency)) pending.push(dependency);
      }
    }
    return visited;
  };
}

function isShared(path) {
  return (
    sharedFiles.has(path) ||
    path.startsWith('web/src/api/') ||
    path.startsWith('web/src/i18n/') ||
    path.startsWith('web/src/design/') ||
    path.startsWith('design/') ||
    /^web\/src\/[^/]+\.css$/.test(path)
  );
}

function isNonRuntime(path) {
  return (
    /\.md$/.test(path) || /^web\/src\/.*\.(test|spec)\.[jt]sx?$/.test(path)
  );
}

export function selectBrowserImpact(
  files,
  inventory,
  entries,
  readDependencies,
) {
  // Reuse the existing safe-path/status/spec validation before considering any
  // narrowing. Changed surviving specs always run completely.
  const changed = selectAdditionalChangedSpecs(files, {
    ...inventory,
    prSpecs: [],
  }).map((path) => path.slice('tests/'.length));
  const selected = new Set(changed);
  const reasons = [];
  for (const [name, entry] of Object.entries(entries)) {
    if (entry.always) selected.add(name);
  }
  function full(reason) {
    return {
      critical: inventory.prSpecs,
      additional: inventory.inventoriedSpecs.filter(
        (name) => !inventory.prSpecs.includes(name),
      ),
      reasons: [reason],
      full: true,
    };
  }
  const paths = new Set(
    files.flatMap((file) =>
      file.status === 'renamed'
        ? [file.filename, file.previous_filename]
        : [file.filename],
    ),
  );
  const runtime = [...paths].filter(
    (path) =>
      !isNonRuntime(path) && !/^web\/e2e\/tests\/[^/]+\.spec\.ts$/.test(path),
  );
  const shared = runtime.find(isShared);
  if (shared) return full(`Shared application foundation: ${shared}`);
  let graph;
  try {
    graph = new Map(
      Object.entries(entries).map(([name, entry]) => [
        name,
        readDependencies([...entry.roots, `web/e2e/tests/${name}`]),
      ]),
    );
  } catch {
    return full('Dependency analysis is incomplete; full regression required.');
  }
  for (const path of runtime) {
    const affected = [...graph]
      .filter(([, dependencies]) => dependencies.has(path))
      .map(([name]) => name);
    if (affected.length === 0)
      return full(`Unmapped or removed dependency: ${path}`);
    for (const name of affected) selected.add(name);
    reasons.push(`${path}: ${affected.length} affected spec(s)`);
  }
  if (changed.length)
    reasons.push(`${changed.length} changed surviving spec(s)`);
  return {
    critical: inventory.prSpecs.filter((name) => selected.has(name)),
    additional: inventory.inventoriedSpecs.filter(
      (name) => selected.has(name) && !inventory.prSpecs.includes(name),
    ),
    reasons: reasons.length
      ? reasons
      : ['Always-run core; no runtime dependency changed.'],
    full: false,
  };
}

export function validatePlannedSpecs(value, mode, inventory, entries) {
  const specs = JSON.parse(value);
  const allowed =
    mode === 'pr' ? inventory.prSpecs : inventory.inventoriedSpecs;
  if (
    !Array.isArray(specs) ||
    specs.length === 0 ||
    new Set(specs).size !== specs.length ||
    specs.some((name) => !allowed.includes(name)) ||
    (mode === 'pr' &&
      Object.entries(entries).some(
        ([name, entry]) => entry.always && !specs.includes(name),
      ))
  ) {
    throw new Error(
      'Invalid browser plan: expected non-empty, classified specs and the complete PR core.',
    );
  }
  return specs;
}
