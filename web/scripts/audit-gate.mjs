import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * High-severity npm audit gate with an explicit, expiring allowlist.
 *
 * `npm audit --audit-level=high` stays the rule. An advisory may be accepted
 * only when `audit-allowlist.json` names its exact id, says why, marks it as a
 * development-only dependency and gives an expiry date. The gate still fails
 * when
 *  - any other high or critical advisory exists,
 *  - an allowlisted advisory has expired, or
 *  - an allowlisted advisory also appears in the production tree
 *    (`npm audit --omit=dev`).
 */

const BLOCKING = new Set(['high', 'critical']);

export function advisoryId(url) {
  const match = /(GHSA-[a-z0-9-]+)/i.exec(url ?? '');
  return match ? match[1].toUpperCase() : (url ?? 'unknown');
}

/** Advisory objects (not package-name references) at or above high severity. */
export function blockingAdvisories(report) {
  const found = new Map();
  for (const vulnerability of Object.values(report?.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via === 'object' && BLOCKING.has(via.severity)) {
        const id = advisoryId(via.url);
        found.set(id, { id, package: via.name, title: via.title });
      }
    }
  }
  return found;
}

export function evaluateAudit({ full, production, allowlist, today }) {
  const failures = [];
  const notes = [];
  const present = blockingAdvisories(full);
  const inProduction = blockingAdvisories(production);
  const entries = new Map(
    (allowlist?.entries ?? []).map((entry) => [
      advisoryId(entry.advisory),
      entry,
    ]),
  );

  for (const entry of entries.values()) {
    if (!entry.reason || !entry.expires || entry.scope !== 'development') {
      failures.push(
        `Allowlist entry ${entry.advisory} needs a reason, an expiry and scope "development".`,
      );
    }
  }

  for (const advisory of present.values()) {
    const entry = entries.get(advisory.id);
    if (!entry) {
      failures.push(
        `${advisory.id} (${advisory.package}): ${advisory.title} is not allowlisted.`,
      );
      continue;
    }
    if (inProduction.has(advisory.id)) {
      failures.push(
        `${advisory.id} (${advisory.package}) is allowlisted for development only but is in the production tree.`,
      );
    } else if (entry.expires < today) {
      failures.push(
        `${advisory.id} (${advisory.package}): the allowlist entry expired on ${entry.expires}.`,
      );
    } else {
      notes.push(
        `${advisory.id} (${advisory.package}) accepted for development tools until ${entry.expires}.`,
      );
    }
  }

  for (const entry of entries.values()) {
    if (!present.has(advisoryId(entry.advisory))) {
      notes.push(
        `${entry.advisory} no longer appears in the audit; remove its allowlist entry.`,
      );
    }
  }
  return { failures, notes };
}

function readAudit(args) {
  try {
    return JSON.parse(
      execFileSync('npm', ['audit', '--json', ...args], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
  } catch (error) {
    // `npm audit` exits non-zero when it finds vulnerabilities; the report is
    // still on stdout. Anything else is a real failure.
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

function main() {
  const allowlist = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../audit-allowlist.json', import.meta.url)),
      'utf8',
    ),
  );
  const today = new Date().toISOString().slice(0, 10);
  const { failures, notes } = evaluateAudit({
    full: readAudit([]),
    production: readAudit(['--omit=dev']),
    allowlist,
    today,
  });
  for (const note of notes) console.log(`note: ${note}`);
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  if (failures.length) process.exit(1);
  console.log('No unaccepted high or critical advisories.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
