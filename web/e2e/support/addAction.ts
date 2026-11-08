import { expect, type Locator } from '@playwright/test';

/** Rendered geometry catches local surface overrides that component tests miss. */
export async function expectLabeledAddAction(action: Locator) {
  await expect(action).toBeVisible();
  const appearance = await action.evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    const token = style.getPropertyValue('--color-action-primary').trim();
    const expected = /^#[a-f\d]{6}$/i.test(token)
      ? `rgb(${[1, 3, 5].map((start) => Number.parseInt(token.slice(start, start + 2), 16)).join(', ')})`
      : token;
    return {
      width: bounds.width,
      height: bounds.height,
      radius: Number.parseFloat(style.borderTopLeftRadius),
      background: style.backgroundColor,
      expected,
      label: element.getAttribute('aria-label'),
      title: element.getAttribute('title'),
      text: element.querySelector<HTMLElement>('.add-action-label')?.innerText,
      iconSize: getComputedStyle(
        element.querySelector('.button-icon') as Element,
      ).inlineSize,
      expectedIconSize: style.getPropertyValue('--icon-size-standard').trim(),
    };
  });
  expect(appearance.width).toBeGreaterThanOrEqual(48);
  expect(appearance.height).toBeGreaterThanOrEqual(48);
  expect(appearance.width).toBeGreaterThan(appearance.height);
  expect(appearance.radius).toBeGreaterThanOrEqual(appearance.height / 2);
  expect(appearance.background).toBe(appearance.expected);
  expect(appearance.label).toBeTruthy();
  expect(appearance.title).toBe(appearance.label);
  expect(appearance.text).toBe(appearance.label);
  expect(appearance.iconSize).toBe(appearance.expectedIconSize);
  await expect(action.locator('.add-action-label')).toBeVisible();
  await expect(action.locator('.eimir-icon-hinzufuegen')).toBeVisible();
}

/** Labeled insertion may wrap, but input and action must never overlap. */
export async function expectInlineAddLayout(input: Locator, action: Locator) {
  const [field, control] = await Promise.all([
    input.boundingBox(),
    action.boundingBox(),
  ]);
  if (!field || !control) throw new Error('Add controls must be visible.');
  expect(field.width).toBeGreaterThanOrEqual(44);
  if (
    control.y < field.y + field.height &&
    field.y < control.y + control.height
  ) {
    expect(field.x + field.width).toBeLessThanOrEqual(control.x);
  } else {
    expect(control.y).toBeGreaterThanOrEqual(field.y + field.height);
  }
}
