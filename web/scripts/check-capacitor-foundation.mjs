import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(webRoot, '..');

function readWeb(relativePath) {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

function readCapacitorAndroid(relativePath) {
  const fullPath = join(repoRoot, 'capacitor-android', relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(
      `Expected staging file missing: capacitor-android/${relativePath}`,
    );
  }
  return readFileSync(fullPath, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Capacitor Foundation assertion failed: ${message}`);
  }
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
  capConfig.includes("path: '../capacitor-android'"),
  "capacitor.config.ts must point android.path to '../capacitor-android'",
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
  !capConfig.includes('allowNavigation'),
  'capacitor.config.ts must NOT define allowNavigation (API access is strictly through CapacitorHttp, not remote page navigation)',
);

// 2. Check capacitor-android/app/build.gradle
const buildGradle = readCapacitorAndroid('app/build.gradle');
assert(
  buildGradle.includes('namespace = "de.eimir.app"') ||
    buildGradle.includes("namespace 'de.eimir.app'") ||
    buildGradle.includes("namespace = 'de.eimir.app'"),
  "capacitor-android/app/build.gradle must set namespace to 'de.eimir.app'",
);
assert(
  buildGradle.includes('applicationId "de.sidebyside.app"') ||
    buildGradle.includes("applicationId 'de.sidebyside.app'"),
  "capacitor-android/app/build.gradle must set base applicationId to 'de.sidebyside.app'",
);
assert(
  buildGradle.includes('applicationIdSuffix ".debug"') ||
    buildGradle.includes("applicationIdSuffix '.debug'"),
  "capacitor-android/app/build.gradle debug buildType must set applicationIdSuffix to '.debug'",
);

// 3. Check capacitor-android/variables.gradle
const variablesGradle = readCapacitorAndroid('variables.gradle');
assert(
  /minSdkVersion\s*=\s*26/.test(variablesGradle),
  'capacitor-android/variables.gradle must preserve minSdkVersion = 26',
);

// 4. Check capacitor-android/app/src/main/AndroidManifest.xml
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

// 6. Check capacitor-android/app/src/main/res/values/strings.xml
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
