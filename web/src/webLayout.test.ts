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

function ruleBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(
    new RegExp(`(^|\\}|\\*/)\\s*${escaped}\\s*\\{([^}]*)\\}`),
  );
  if (!match) throw new Error(`CSS rule is missing: ${selector}`);
  return match[2];
}

const layoutCss = readSource('./layout.css');
const shellCss = readSource('./shell.css');
const stylesCss = readSource('./styles.css');
const memoryPolishCss = readSource('./memory-create-polish.css');
const commentsCss = readSource('./components/CommentsPanel.css');
const timelineProgressiveCss = readSource(
  './components/StoryTimelineProgressive.css',
);
const discoverRevealCss = readSource('./components/StoryDiscoverReveal.css');
const productRolesCss = readSource('./design/product-roles.css');
const sharedPlanningSanctuaryCss = readSource(
  './components/SharedPlanningSanctuary.css',
);

describe('web layout primitives', () => {
  it('lets a page fill the bounded main region instead of a reading column', () => {
    expect(ruleBlock(layoutCss, '.page')).toContain('width: 100%');
    expect(ruleBlock(layoutCss, '.page-reading')).toContain(
      'width: min(100%, var(--reading-max))',
    );
  });

  it('bounds the main region at the documented content width', () => {
    const desktop = shellCss.slice(
      shellCss.indexOf('@media (min-width: 840px)'),
    );
    expect(desktop).toContain('width: min(var(--content-max)');
    expect(stylesCss).toContain('--content-max: 1200px');
    expect(stylesCss).toContain('--reading-max: 720px');
  });

  it('splits into two content zones only from the desktop breakpoint', () => {
    const split = ruleBlock(layoutCss, '.layout-split');
    expect(split).toContain('display: grid');
    expect(split).not.toContain('grid-template-columns');

    const wide = layoutCss.slice(
      layoutCss.indexOf('@media (min-width: 1100px)'),
    );
    expect(wide).toContain(
      'grid-template-columns: minmax(0, 1fr) var(--rail-width)',
    );
  });

  it('places a leading context rail in the trailing column without reordering the document', () => {
    const wide = layoutCss.slice(
      layoutCss.indexOf('@media (min-width: 1100px)'),
    );
    expect(wide).toMatch(
      /\.layout-split-lead-rail \.layout-main\s*\{[^}]*grid-area: 1 \/ 1/s,
    );
    expect(wide).toMatch(
      /\.layout-split-lead-rail \.layout-rail\s*\{[^}]*grid-area: 1 \/ 2/s,
    );
  });

  it('derives overview columns from a single tunable minimum width', () => {
    expect(ruleBlock(layoutCss, '.layout-columns')).toContain(
      'minmax(min(100%, var(--layout-column-min, 22rem)), 1fr)',
    );
    expect(ruleBlock(layoutCss, '.layout-columns-dense')).toContain(
      '--layout-column-min: 17rem',
    );
  });

  it('keeps long-form text inside a reading measure on wide pages', () => {
    expect(
      ruleBlock(
        layoutCss,
        '.page-heading > p:last-child,\n.page-heading > div > p:last-child',
      ),
    ).toContain('max-width: var(--reading-max)');
    expect(ruleBlock(layoutCss, '.layout-section-head p')).toContain(
      'max-width: var(--reading-max)',
    );
  });

  it('gives primary navigation pages one tokenized title scale and content rhythm', () => {
    const rootHeader = ruleBlock(layoutCss, '.page-heading-root');
    expect(rootHeader).toContain('margin-bottom: var(--space-section)');
    expect(rootHeader).toContain('padding-bottom: 0');

    const rootTitle = ruleBlock(layoutCss, '.page-heading-root h1');
    expect(rootTitle).toContain('min-inline-size: 0');
    expect(rootTitle).toContain('max-width: 100%');
    expect(rootTitle).toContain('font: var(--font-page-heading)');
    expect(rootTitle).toContain('letter-spacing: var(--tracking-page-heading)');
    expect(rootTitle).toContain('overflow-wrap: anywhere');

    expect(sharedPlanningSanctuaryCss).toContain(
      '& .page-heading:not(.page-heading-root) {',
    );

    expect(productRolesCss).toContain(
      '--font-page-heading: 700 2.25rem / 1.15 "Literata", "Georgia", serif',
    );
    expect(productRolesCss).toContain('--tracking-page-heading: -0.015em');
  });

  it('stacks the page header and its action on compact viewports', () => {
    const compact = layoutCss.slice(
      layoutCss.indexOf('@media (max-width: 599px)'),
    );
    expect(compact).toMatch(/\.page-heading\s*\{[^}]*flex-direction: column/s);
  });
});

describe('module boundary rhythm', () => {
  it('uses spacing and surfaces instead of standalone module divider hairlines', () => {
    const cases: Array<[string, string, string]> = [
      ['./styles.css', '.app-header', 'border-bottom'],
      ['./theme.css', '.app-header', 'border-bottom'],
      ['./layout.css', '.page-heading', 'border-bottom'],
      [
        './components/SharedStorySummary.css',
        '.shared-story-summary',
        'border-top',
      ],
      ['./components/CommentsPanel.css', '.comments-panel', 'border-top'],
      [
        './components/ProfileIdentityPanel.css',
        '.profile-identity-hero-card',
        'border-bottom',
      ],
      [
        './components/ProfileIdentityPanel.css',
        '.profile-name-inline-form,\n.profile-birthday-inline-form',
        'border-top',
      ],
      [
        './components/PlanningCreatePage.css',
        '.planning-optional-details',
        'border-top',
      ],
      [
        './components/PlanningCreatePage.css',
        '.planning-optional-details',
        'border-bottom',
      ],
      [
        './components/HeartMomentCreateReference.css',
        '.heart-moment-create-actions.form-actions',
        'border-top',
      ],
      [
        './components/StoryProductPages.css',
        '.story-active-chips',
        'border-top',
      ],
      [
        './components/RelatedPeoplePage.css',
        '.important-dates-section',
        'border-top',
      ],
      [
        './components/SettingsPage.css',
        '.settings-sensitive-grid',
        'border-top',
      ],
      ['./components/TransferPanel.css', '.transfer-columns', 'border-top'],
      [
        './components/PlanningReference.css',
        '.planen-operations',
        'border-top',
      ],
      ['./components/PlanningReference.css', '.planen-history', 'border-top'],
      [
        './components/PrivateAreaProductPage.css',
        '.private-checklist-completed-section',
        'border-top',
      ],
      [
        './components/OurMomentsGamePage.css',
        '.our-moments-turn',
        'border-bottom',
      ],
      [
        './components/WishDetectiveGamePage.css',
        '.wish-detective-meta',
        'border-bottom',
      ],
    ];

    for (const [relativePath, selector, property] of cases) {
      expect(ruleBlock(readSource(relativePath), selector)).not.toContain(
        `${property}:`,
      );
    }

    const compactOverrides = readSource('./product-reflow.css');
    expect(compactOverrides).not.toMatch(
      /settings-sensitive-grid\s*>\s*\.account-settings-panel[\s\S]*?border-top:/,
    );
    expect(compactOverrides).not.toMatch(
      /transfer-columns\s*>\s*section\s*\+\s*section[\s\S]*?border-top:/,
    );
  });
});

describe('web layout tokens', () => {
  it('defines the layout scale used by the primitives', () => {
    expect(stylesCss).toContain('--rail-width:');
    expect(stylesCss).toContain('--topbar-height:');
    expect(stylesCss).toContain('--color-surface-panel:');
  });

  it('resolves every custom property consumed by production Web stylesheets', () => {
    const sources = [
      stylesCss,
      shellCss,
      layoutCss,
      readSource('./theme.css'),
      productRolesCss,
      readSource('./story-media.css'),
      readSource('./attachment-drafts.css'),
      readSource('./demo.css'),
      readSource('./product-reflow.css'),
      readSource('./memory-create-polish.css'),
      readSource('./components/CommentsPanel.css'),
      readSource('./components/LoginExperience.css'),
      readSource('./components/M4ProductPages.css'),
      readSource('./components/MediaGallery.css'),
      readSource('./components/MemoryProductPage.css'),
      readSource('./components/MoreOverviewPage.css'),
      readSource('./components/PrivateAreaProductPage.css'),
      readSource('./components/ProfilePage.css'),
      readSource('./components/QuickCreateMenu.css'),
      readSource('./components/RelatedPeopleAccessibility.css'),
      readSource('./components/RelatedPeoplePage.css'),
      readSource('./components/PlanningReference.css'),
      readSource('./components/SharedPlanningMotion.css'),
      readSource('./components/SharedPlanningPages.css'),
      readSource('./components/SharedPlanningSanctuary.css'),
      readSource('./components/StoryMomentMetadata.css'),
      readSource('./components/StoryProductPages.css'),
      timelineProgressiveCss,
      discoverRevealCss,
      readSource('./components/TodayPage.css'),
    ].join('\n');

    const defined = new Set(
      [...sources.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]),
    );
    const consumed = [
      ...sources.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/g),
    ].map((match) => match[1]);

    const unresolved = [
      ...new Set(consumed.filter((name) => !defined.has(name))),
    ];
    expect(unresolved).toEqual([]);
  });
});

describe('mobile feed compositor budget (#1028)', () => {
  it('does not pin every unrevealed Timeline or Discover item into a compositor layer', () => {
    expect(timelineProgressiveCss).not.toContain('will-change:');
    expect(discoverRevealCss).not.toContain('will-change:');
  });
});

describe('Story detail comment density (#1024)', () => {
  it('uses one compact shared handoff from the final comment to the compose action', () => {
    expect(ruleBlock(commentsCss, '.comments-panel-compact')).toContain(
      'gap: var(--space-2)',
    );
    expect(
      ruleBlock(commentsCss, '.comments-panel-compact .comment-card'),
    ).toContain('padding: var(--space-2) 0');
    expect(
      ruleBlock(
        commentsCss,
        '.comments-panel-compact .comment-card:last-child',
      ),
    ).toContain('padding-bottom: 0');
  });
});

describe('compact navigation', () => {
  it('owns the bottom navigation grid in one stylesheet', () => {
    expect(ruleBlock(shellCss, '.mobile-bottom-shell')).toContain(
      'grid-template-columns: repeat(5, minmax(0, 1fr))',
    );

    const pageStylesheets = [
      readSource('./components/M4ProductPages.css'),
      readSource('./components/ProfilePage.css'),
      readSource('./components/RelatedPeoplePage.css'),
      readSource('./components/PrivateAreaProductPage.css'),
      readSource('./components/SharedPlanningPages.css'),
      readSource('./components/StoryProductPages.css'),
    ];
    for (const css of pageStylesheets) {
      expect(css).not.toContain('.mobile-bottom-shell');
      expect(css).not.toContain('.mobile-bottom-nav');
    }
  });
});

describe('shared form controls', () => {
  it('gives selects the same surface as text inputs', () => {
    expect(stylesCss).toMatch(
      /input:not\(\[type="checkbox"\], \[type="radio"\]\),\s*select,\s*textarea\s*\{[^}]*min-height: 48px/s,
    );
  });

  it('sizes checkboxes and radios as controls rather than fields', () => {
    const block = ruleBlock(
      stylesCss,
      'input[type="checkbox"],\ninput[type="radio"]',
    );
    expect(block).toContain('width: 1.25rem');
    expect(block).not.toContain('100%');
  });

  it('does not turn a choice row into a field label', () => {
    expect(stylesCss).toContain(
      '.form-grid > label:not(.choice-row),\n.field-group > label:first-child:not(.choice-row)',
    );
  });
});

describe('Memory Create R1 composition regressions (#964)', () => {
  it('removes the retired generic optional-details disclosure surface', () => {
    // #964 moves narrative and date out of a generic "more details" disclosure;
    // the disclosure and its chevron/summary polish are retired, not reused.
    expect(memoryPolishCss).not.toMatch(/\.immersive-create-details\b/s);
    expect(memoryPolishCss).not.toMatch(/\.summary-chevron\b/s);
  });

  it('scopes date-summary hover feedback to fine-pointer and hover-capable devices to prevent sticky hover on touch', () => {
    const withoutHoverMedia = memoryPolishCss.replace(
      /@media\s*\(\s*hover:\s*hover\s*\)\s*and\s*\(\s*pointer:\s*fine\s*\)\s*\{[\s\S]*?\n\}/g,
      '',
    );
    expect(withoutHoverMedia).not.toMatch(
      /\.immersive-create-date-summary:hover/s,
    );

    expect(memoryPolishCss).toMatch(
      /@media\s*\(\s*hover:\s*hover\s*\)\s*and\s*\(\s*pointer:\s*fine\s*\)\s*\{[\s\S]*?\.immersive-create-date-summary:hover\s*\{[\s\S]*?background:\s*var\(--color-surface\);/s,
    );
  });
});
