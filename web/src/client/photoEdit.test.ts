import { describe, expect, it } from 'vitest';
import {
  clampTextSize,
  emptyEdit,
  FULL_BOX,
  MAX_TEXT_SIZE,
  MIN_TEXT_SIZE,
  type NormalizedBox,
  panCrop,
  resizeCrop,
  TEXT_SIZE,
  turnEditLeft,
  zoomCrop,
} from './photoEdit';

const MIN = { width: 0.1, height: 0.1 };

function expectBox(actual: NormalizedBox, expected: NormalizedBox) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.width).toBeCloseTo(expected.width);
  expect(actual.height).toBeCloseTo(expected.height);
}

describe('panCrop', () => {
  it('moves the section over the photo', () => {
    expectBox(panCrop({ x: 0.2, y: 0.2, width: 0.5, height: 0.5 }, 0.1, -0.1), {
      x: 0.3,
      y: 0.1,
      width: 0.5,
      height: 0.5,
    });
  });

  it('never moves the section off the photo', () => {
    expectBox(panCrop({ x: 0.2, y: 0.2, width: 0.5, height: 0.5 }, 1, -1), {
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 0.5,
    });
  });
});

describe('zoomCrop', () => {
  it('zooms in around the anchor, keeping its photo point in place', () => {
    const zoomed = zoomCrop(FULL_BOX, 2, { x: 0.25, y: 0.75 }, MIN);
    expectBox(zoomed, { x: 0.125, y: 0.375, width: 0.5, height: 0.5 });
    // The anchor point (0.25, 0.75) is still a quarter in, three quarters down.
    expect(zoomed.x + 0.25 * zoomed.width).toBeCloseTo(0.25);
    expect(zoomed.y + 0.75 * zoomed.height).toBeCloseTo(0.75);
  });

  it('keeps the shape of the section', () => {
    const zoomed = zoomCrop(
      { x: 0, y: 0, width: 0.8, height: 0.4 },
      1.6,
      { x: 0.5, y: 0.5 },
      MIN,
    );
    expect(zoomed.width / zoomed.height).toBeCloseTo(2);
  });

  it('stops at the deepest zoom', () => {
    const zoomed = zoomCrop(FULL_BOX, 100, { x: 0.5, y: 0.5 }, MIN);
    expectBox(zoomed, { x: 0.45, y: 0.45, width: 0.1, height: 0.1 });
  });

  it('zooms out no further than the photo allows', () => {
    const zoomed = zoomCrop(
      { x: 0.4, y: 0.1, width: 0.4, height: 0.8 },
      0.1,
      { x: 0.5, y: 0.5 },
      MIN,
    );
    expectBox(zoomed, { x: 0.35, y: 0, width: 0.5, height: 1 });
  });
});

describe('resizeCrop', () => {
  it('moves only the edges a corner owns', () => {
    expectBox(resizeCrop(FULL_BOX, 'se', -0.2, -0.3, MIN), {
      x: 0,
      y: 0,
      width: 0.8,
      height: 0.7,
    });
    expectBox(resizeCrop(FULL_BOX, 'nw', 0.2, 0.1, MIN), {
      x: 0.2,
      y: 0.1,
      width: 0.8,
      height: 0.9,
    });
  });

  it('moves only one edge for an edge handle', () => {
    expectBox(resizeCrop(FULL_BOX, 'n', 0.3, 0.2, MIN), {
      x: 0,
      y: 0.2,
      width: 1,
      height: 0.8,
    });
  });

  it('keeps the section inside the photo, the limits and the minimum', () => {
    const crop = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
    expectBox(resizeCrop(crop, 'nw', -1, -1, MIN), {
      x: 0,
      y: 0,
      width: 0.6,
      height: 0.6,
    });
    expectBox(resizeCrop(crop, 'se', -1, -1, MIN), {
      x: 0.2,
      y: 0.2,
      width: 0.1,
      height: 0.1,
    });
    expectBox(
      resizeCrop(crop, 'e', 1, 0, MIN, { x: 0, y: 0, width: 0.7, height: 1 }),
      { x: 0.2, y: 0.2, width: 0.5, height: 0.4 },
    );
  });
});

describe('turnEditLeft', () => {
  it('turns the section, the drawing and the texts with the photo', () => {
    const turned = turnEditLeft({
      ...emptyEdit(),
      crop: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      strokes: [{ color: '#fff', points: [{ x: 0.9, y: 0.1 }] }],
      texts: [
        {
          id: 'a',
          text: 'Hallo',
          color: '#fff',
          font: 'hand',
          size: TEXT_SIZE,
          x: 0.25,
          y: 0.5,
        },
      ],
    });
    expect(turned.turns).toBe(3);
    expectBox(turned.crop, { x: 0.2, y: 0.6, width: 0.4, height: 0.3 });
    expect(turned.strokes[0].points[0].x).toBeCloseTo(0.1);
    expect(turned.strokes[0].points[0].y).toBeCloseTo(0.1);
    expect(turned.texts[0]).toMatchObject({ font: 'hand', x: 0.5, y: 0.75 });
  });

  it('returns to the start after four turns', () => {
    let edit = {
      ...emptyEdit(),
      crop: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    };
    for (let turn = 0; turn < 4; turn += 1) edit = turnEditLeft(edit);
    expect(edit.turns).toBe(0);
    expectBox(edit.crop, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });
});

describe('clampTextSize', () => {
  it('keeps text sizes readable and inside the photo', () => {
    expect(clampTextSize(0)).toBe(MIN_TEXT_SIZE);
    expect(clampTextSize(5)).toBe(MAX_TEXT_SIZE);
    expect(clampTextSize(TEXT_SIZE)).toBe(TEXT_SIZE);
  });
});
