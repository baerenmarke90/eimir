import { describe, expect, it } from 'vitest';

type NodeFs = {
  readFileSync(path: URL, encoding: 'utf8'): string;
};

type NodeProcess = {
  getBuiltinModule(name: 'fs'): NodeFs;
};

function readSource(relativePath: string): string {
  const processRef = (
    globalThis as typeof globalThis & { process?: NodeProcess }
  ).process;
  if (!processRef)
    throw new Error('Node process API is unavailable in the test run.');
  return processRef
    .getBuiltinModule('fs')
    .readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('shared hidden file input helper', () => {
  const stylesCss = readSource('./styles.css');
  const storyMediaCss = readSource('./story-media.css');
  const attachmentDraftPickerSource = readSource(
    './components/AttachmentDraftPicker.tsx',
  );
  const profileIdentitySource = readSource(
    './components/ProfileIdentityPanel.tsx',
  );
  const profileIdentityCss = readSource(
    './components/ProfileIdentityPanel.css',
  );
  const memoryProductCss = readSource('./components/MemoryProductPage.css');

  it('keeps hidden file inputs clipped instead of inheriting visible field geometry', () => {
    expect(stylesCss).toMatch(
      /\.sr-only,\s*\.visually-hidden-input\s*\{[^}]*position: absolute;[^}]*width: 1px;[^}]*height: 1px;/s,
    );
    expect(storyMediaCss).toMatch(
      /input\.visually-hidden-input\s*\{[^}]*width: 1px;[^}]*min-height: 0;[^}]*border: 0;[^}]*padding: 0;/s,
    );
    expect(storyMediaCss).not.toContain('!important');
  });

  it('lets the shared picker shrink inside compact grid editors', () => {
    expect(attachmentDraftPickerSource).toContain(
      'className="field-group attachment-draft-picker"',
    );
    expect(storyMediaCss).toMatch(
      /\.attachment-draft-picker\s*\{[^}]*min-width: 0;/s,
    );
    expect(storyMediaCss).toMatch(
      /\.file-picker > span:not\(\.file-picker-icon\)\s*\{[^}]*min-width: 0;/s,
    );
  });

  it('preserves a visible focus proxy for keyboard-operated upload pickers', () => {
    expect(storyMediaCss).toMatch(
      /\.visually-hidden-input:focus-visible \+ \.file-picker\s*\{[^}]*outline: 3px solid var\(--color-focus\);[^}]*outline-offset: 2px;/s,
    );
  });

  it('uses the shared helpers without profile or memory surface overrides', () => {
    expect(profileIdentitySource).toContain('className="sr-only"');
    expect(profileIdentitySource).toContain(
      'className="profile-identity-file-input visually-hidden-input"',
    );
    expect(profileIdentityCss).not.toContain('.visually-hidden');
    expect(memoryProductCss).not.toContain(
      'input[type="file"].visually-hidden-input',
    );
  });
});
