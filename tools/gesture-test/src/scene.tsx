/*
 * Shared test scene: a feed behind a bottom sheet, a main-thread load
 * generator that stands in for React rendering during the gesture, and a
 * probe the measurement script reads. Only the sheet's gesture differs
 * between the variants.
 */
import { type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './scene.css';
import { Toolbar } from './toolbar';

export const SHEET_HEIGHT_RATIO = 0.6;

type Mark = { name: string; t: number; [key: string]: unknown };

interface Probe {
  ready: boolean;
  samples: { t: number; y: number }[];
  marks: Mark[];
  styleWrites: number;
  mark(name: string, data?: Record<string, unknown>): void;
}

declare global {
  interface Window {
    __probe: Probe;
  }
}

const probe: Probe = {
  ready: false,
  samples: [],
  marks: [],
  styleWrites: 0,
  mark(name, data = {}) {
    const t = performance.now();
    probe.marks.push({ name, t, styleWrites: probe.styleWrites, ...data });
    performance.mark(`gt-${name}`);
  },
};
window.__probe = probe;

/** The sheet's visible offset from its resting place, in CSS px. */
export function sheetOffset(): number {
  const sheet = document.querySelector<HTMLElement>('[data-sheet]');
  if (!sheet) return 0;
  return sheet.getBoundingClientRect().top - restingTop();
}

function restingTop(): number {
  return window.innerHeight * (1 - SHEET_HEIGHT_RATIO);
}

export function sheetHeight(): number {
  return window.innerHeight * SHEET_HEIGHT_RATIO;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * From the release on, busy-waits `loadMs` in every frame for 800 ms, like
 * the React render that closing a sheet or changing a tab causes while the
 * settle runs. It starts at release so that it does not slow down the
 * scripted pointer input itself.
 */
function startLoad(loadMs: number) {
  if (loadMs <= 0) return;
  let until = 0;
  const original = probe.mark;
  probe.mark = (name, data) => {
    if (name === 'release') until = performance.now() + 800;
    original(name, data);
  };
  const tick = () => {
    if (performance.now() > until) {
      requestAnimationFrame(tick);
      return;
    }
    const end = performance.now() + loadMs;
    while (performance.now() < end) {
      // Deliberate main-thread work.
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function startSampling() {
  const sample = () => {
    probe.samples.push({ t: performance.now(), y: sheetOffset() });
    // Keep about a minute of frames on a device that stays open.
    if (probe.samples.length > 4000) probe.samples.splice(0, 1000);
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  // Main-thread style writes on the sheet (WAAPI and CSS transitions make
  // none while they run; per-frame JavaScript animation makes one per frame).
  const observe = () => {
    const sheet = document.querySelector('[data-sheet]');
    if (!sheet) return requestAnimationFrame(observe);
    new MutationObserver((records) => {
      probe.styleWrites += records.length;
    }).observe(sheet, { attributes: true, attributeFilter: ['style'] });
  };
  observe();
}

function Feed() {
  return (
    <main className="feed">
      {Array.from({ length: 120 }, (_, index) => (
        <article className="feed-item" key={index}>
          <div className="feed-thumb" />
          <div className="feed-lines">
            <div className="feed-line" />
            <div className="feed-line short" />
          </div>
        </article>
      ))}
    </main>
  );
}

export function SheetContent() {
  return (
    <>
      <div className="sheet-handle" aria-hidden="true" />
      <h2 className="sheet-title">Sheet</h2>
      <p className="sheet-copy">Drag down to dismiss.</p>
    </>
  );
}

export function mountScene(sheet: ReactNode, variant?: string) {
  const params = new URLSearchParams(location.search);
  startLoad(Number(params.get('load') ?? 0));
  startSampling();
  const root = document.getElementById('root');
  if (!root) throw new Error('missing root');
  createRoot(root).render(
    <StrictMode>
      {variant ? <Toolbar variant={variant} /> : null}
      <Feed />
      {sheet}
    </StrictMode>,
  );
  const waitReady = () => {
    if (document.querySelector('[data-sheet][data-ready]')) probe.ready = true;
    else requestAnimationFrame(waitReady);
  };
  waitReady();
}
