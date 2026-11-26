import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';

/*
 * Kept primary tabs are parked and shown by toggling `hidden`, `inert` and
 * `aria-hidden`. When any `:has()` argument in the app's stylesheets names
 * one of these attributes, Chromium checks every ancestor's `:has()` rules
 * on each toggle and restyles whole subtrees: on the Pixel a tab reveal cost
 * 10-40 ms of style instead of 0.4-6 ms (#2320). Use a class or a data
 * attribute of the component instead.
 */

const SOURCE = __dirname;
/**
 * Attributes that change with every tab park, swipe or slide. In a `:has()`
 * argument any of them makes each change re-check the ancestors' `:has()`
 * rules, and a non-subject `:has()` then restyles the whole document (on the
 * Pixel 2,016 elements in 58 ms at each swipe start). The press mirror
 * (`useControlPressFeedback`) is set on the touched control at the start of
 * every tap and of every swipe that begins on a control.
 */
const TOGGLED =
  /\[\s*(hidden|inert|aria-hidden|data-primary-tab-[\w-]+|data-navigation-[\w-]+|data-pages-moving|data-control-pressed)\b/;

function stylesheets(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return name.endsWith('.css') ? [path] : [];
  });
}

/** The arguments of every `:has(...)`, with nested parentheses. */
function hasArguments(css: string): string[] {
  const found: string[] = [];
  let at = css.indexOf(':has(');
  while (at !== -1) {
    let depth = 0;
    let end = at + 4;
    for (; end < css.length; end += 1) {
      if (css[end] === '(') depth += 1;
      else if (css[end] === ')' && --depth === 0) break;
    }
    found.push(css.slice(at + 5, end));
    at = css.indexOf(':has(', end);
  }
  return found;
}

it('names no attribute that a tab change toggles inside a :has() argument', () => {
  const offenders = stylesheets(SOURCE).flatMap((path) => {
    const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    return hasArguments(css)
      .filter((argument) => TOGGLED.test(argument))
      .map((argument) => `${relative(SOURCE, path)}: :has(${argument.trim()})`);
  });
  expect(offenders).toEqual([]);
});
