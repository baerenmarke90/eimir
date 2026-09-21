import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(webRoot, '..');

function readWeb(relativePath) {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

function readCapacitorAndroid(relativePath) {
  const fullPath = join(repoRoot, 'android', relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(
      `Expected canonical wrapper file missing: android/${relativePath}`,
    );
  }
  return readFileSync(fullPath, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Capacitor Foundation assertion failed: ${message}`);
  }
}

// 0. There is exactly one Android Gradle project: the Capacitor wrapper at
// android/. The former staging path and the retired Kotlin build must not return.
assert(
  !existsSync(join(repoRoot, 'capacitor-android')),
  'capacitor-android/ staging path must not exist; the wrapper lives in android/',
);
for (const retired of [
  'app/build.gradle.kts',
  'build.gradle.kts',
  'settings.gradle.kts',
  'api/generated',
]) {
  assert(
    !existsSync(join(repoRoot, 'android', retired)),
    `android/${retired} belongs to the retired Kotlin/Compose client and must not exist`,
  );
}

// 1. Check web/capacitor.config.ts
const capConfig = readWeb('capacitor.config.ts');
assert(
  capConfig.includes("appId: 'de.sidebyside.app'"),
  "capacitor.config.ts must set appId to 'de.sidebyside.app'",
);
assert(
  capConfig.includes("appName: 'eimir.'"),
  "capacitor.config.ts must set appName to 'eimir.'",
);
assert(
  capConfig.includes("webDir: 'dist'"),
  "capacitor.config.ts must package local 'dist' webDir",
);
assert(
  capConfig.includes("path: '../android'"),
  "capacitor.config.ts must point android.path to the canonical root '../android' wrapper",
);
assert(
  !capConfig.includes('url:') && !capConfig.includes('"url"'),
  'capacitor.config.ts must NOT define a remote server.url (local bundle packaging only)',
);
assert(
  capConfig.includes('CapacitorHttp') && capConfig.includes('enabled: true'),
  'capacitor.config.ts must enable CapacitorHttp plugin for native container cross-origin transport',
);
assert(
  capConfig.includes('SystemBars') &&
    capConfig.includes("insetsHandling: 'css'"),
  "capacitor.config.ts must configure SystemBars with insetsHandling: 'css'",
);
assert(
  !capConfig.includes('allowNavigation'),
  'capacitor.config.ts must NOT define allowNavigation (API access is strictly through CapacitorHttp, not remote page navigation)',
);

// 2. Check CSS safe-area rules for normal-flow statusbar separation
const stylesCss = readWeb('src/styles.css');
const headerMatch = stylesCss.match(/\.app-header\s*\{([^}]+)\}/);
assert(headerMatch, '.app-header rule must exist in styles.css');
const headerRules = headerMatch?.[1] ?? '';
assert(
  headerRules.includes('position: relative;') &&
    !/position:\s*(?:sticky|fixed)/.test(headerRules) &&
    !/\btop\s*:/.test(headerRules),
  '.app-header must remain in normal document flow, never sticky/fixed',
);
assert(
  headerRules.includes('var(--shell-header-safe-top, 0px)'),
  '.app-header must incorporate the shell-owned top safe-area spacing',
);

const demoCss = readWeb('src/demo.css');
assert(
  demoCss.includes('var(--safe-area-inset-top, env(safe-area-inset-top, 0px))'),
  '.demo-instance-banner in demo.css must incorporate var(--safe-area-inset-top, env(safe-area-inset-top, 0px))',
);

const shellCss = readWeb('src/shell.css');
assert(
  shellCss.includes('--shell-header-safe-top: var(') &&
    shellCss.includes('env(safe-area-inset-top, 0px)'),
  '.product-shell must route the native top inset into normal-flow header spacing',
);
assert(
  shellCss.includes('#root:has(> .demo-instance-banner) .product-shell') &&
    shellCss.includes('--shell-header-safe-top: 0px;'),
  '.demo-instance-banner must consume the native top inset without double-padding the app header',
);
assert(
  !shellCss.includes('.product-shell:not([data-focused-task="true"])::before'),
  '.product-shell must not keep a fixed statusbar/header scrim after the header enters normal flow',
);

// 3. Check android/app/build.gradle
const buildGradle = readCapacitorAndroid('app/build.gradle');
assert(
  buildGradle.includes('namespace = "de.eimir.app"') ||
    buildGradle.includes("namespace 'de.eimir.app'") ||
    buildGradle.includes("namespace = 'de.eimir.app'"),
  "android/app/build.gradle must set namespace to 'de.eimir.app'",
);
assert(
  buildGradle.includes('applicationId "de.sidebyside.app"') ||
    buildGradle.includes("applicationId 'de.sidebyside.app'"),
  "android/app/build.gradle must set base applicationId to 'de.sidebyside.app'",
);
assert(
  buildGradle.includes('applicationIdSuffix ".debug"') ||
    buildGradle.includes("applicationIdSuffix '.debug'"),
  "android/app/build.gradle debug buildType must set applicationIdSuffix to '.debug'",
);

// 3b. Check android/variables.gradle
const variablesGradle = readCapacitorAndroid('variables.gradle');
assert(
  /minSdkVersion\s*=\s*26/.test(variablesGradle),
  'android/variables.gradle must preserve minSdkVersion = 26',
);

// 4. Check android/app/src/main/AndroidManifest.xml
const manifest = readCapacitorAndroid('app/src/main/AndroidManifest.xml');
assert(
  manifest.includes('android:name=".MainActivity"') ||
    manifest.includes('android:name="de.eimir.app.MainActivity"'),
  'AndroidManifest.xml must declare MainActivity',
);
assert(
  manifest.includes('android:scheme="de.sidebyside.app"') &&
    manifest.includes('android:host="recent-authentication"') &&
    manifest.includes('android:path="/oidc"'),
  'AndroidManifest.xml must preserve recent-authentication OIDC callback intent filter (de.sidebyside.app://recent-authentication/oidc)',
);

// 5. Check MainActivity.java package
const mainActivity = readCapacitorAndroid(
  'app/src/main/java/de/eimir/app/MainActivity.java',
);
assert(
  mainActivity.includes('package de.eimir.app;'),
  'MainActivity.java must belong to package de.eimir.app',
);

// 6. Check android/app/src/main/res/values/strings.xml
const stringsXml = readCapacitorAndroid('app/src/main/res/values/strings.xml');
assert(
  stringsXml.includes('<string name="app_name">eimir.</string>'),
  'strings.xml must set app_name to "eimir."',
);
assert(
  stringsXml.includes('<string name="package_name">de.sidebyside.app</string>'),
  'strings.xml must set package_name to "de.sidebyside.app"',
);

console.log('✅ Capacitor foundation checks passed.');
