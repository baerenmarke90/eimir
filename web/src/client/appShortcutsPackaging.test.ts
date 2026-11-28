// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');
const xml = (path: string) =>
  new DOMParser().parseFromString(read(path), 'application/xml');
const android = 'http://schemas.android.com/apk/res/android';
const attr = (element: Element, name: string) =>
  element.getAttributeNS(android, name);

it('installs the three static shortcuts on every selectable launcher alias', () => {
  const manifest = xml('android/app/src/main/AndroidManifest.xml');
  const entry = [...manifest.querySelectorAll('activity')].find(
    (item) => attr(item, 'name') === '.AppShortcutActivity',
  );
  expect(entry).toBeDefined();
  expect(attr(entry!, 'taskAffinity')).toBe('');
  expect(attr(entry!, 'noHistory')).toBe('true');
  const aliases = [...manifest.querySelectorAll('activity-alias')];
  expect(aliases).toHaveLength(11);
  for (const alias of aliases) {
    expect(
      [...alias.querySelectorAll('meta-data')].some(
        (entry) =>
          attr(entry, 'name') === 'android.app.shortcuts' &&
          attr(entry, 'resource') === '@xml/app_shortcuts',
      ),
    ).toBe(true);
  }
  for (const [source, packageName] of [
    ['main', 'de.eimir.app'],
    ['debug', 'de.eimir.app.debug'],
  ]) {
    const items = [
      ...xml(
        `android/app/src/${source}/res/xml/app_shortcuts.xml`,
      ).querySelectorAll('shortcut'),
    ];
    expect(items.map((item) => attr(item, 'shortcutId'))).toEqual([
      'moment',
      'wish',
      'plan',
    ]);
    for (const item of items) {
      const intent = item.querySelector('intent')!;
      expect(attr(intent, 'targetPackage')).toBe(packageName);
      expect(attr(intent, 'targetClass')).toBe(
        'de.eimir.app.AppShortcutActivity',
      );
      expect(attr(intent.querySelector('extra')!, 'value')).toBe(
        attr(item, 'shortcutId'),
      );
    }
  }
  expect(
    read('android/app/src/debug/res/xml/app_shortcuts.xml').replaceAll(
      'de.eimir.app.debug',
      'de.eimir.app',
    ),
  ).toBe(read('android/app/src/main/res/xml/app_shortcuts.xml'));
});
it('ships matching German and English menu titles on both platforms', () => {
  const plist = xml('ios/App/App/Info.plist');
  const items = [...plist.querySelectorAll('key')].find(
    (key) => key.textContent === 'UIApplicationShortcutItems',
  )!.nextElementSibling!;
  const titles = [...items.querySelectorAll('key')]
    .filter((key) => key.textContent === 'UIApplicationShortcutItemTitle')
    .map((key) => key.nextElementSibling!.textContent!);
  expect(titles).toHaveLength(3);
  for (const locale of ['de', 'en']) {
    const native = xml(
      `android/app/src/main/res/${locale === 'en' ? 'values' : 'values-de'}/strings.xml`,
    );
    const strings = read(`ios/App/App/${locale}.lproj/InfoPlist.strings`);
    for (const [i, action] of ['moment', 'wish', 'plan'].entries()) {
      const label = native.querySelector(
        `string[name="shortcut_${action}"]`,
      )!.textContent;
      expect(label).toBeTruthy();
      expect(strings).toContain(`"${titles[i]}" = "${label}";`);
    }
  }
});
