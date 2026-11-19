/*
 * On-device controls for the gesture-test build: back to the overview,
 * reset the sheet, switch the simulated render load, and the frame values
 * of the last gesture. The values are also logged as one JSON line with the
 * `[gesture-test]` prefix, readable with `adb logcat` (Capacitor/Console).
 * The labels are German because the build is a Product Owner test tool,
 * not product UI.
 */
import { useEffect, useState } from 'react';

export const VARIANT_LABELS: Record<string, string> = {
  current: 'A · Heute (CSS)',
  waapi: 'B · Eigene Lösung (WAAPI)',
  motion: 'C · Motion',
};

interface Stats {
  dismissed: boolean;
  settleMs: number;
  /** Main-thread (requestAnimationFrame) frames; a compositor settle can be smoother than these. */
  mainThreadFrames: number;
  mainThreadMaxGapMs: number;
  mainThreadLongFrames: number;
  velocity: number | null;
  styleWrites: number;
}

function readStats(): Stats | null {
  const probe = window.__probe;
  const release = [...probe.marks].reverse().find((m) => m.name === 'release');
  const settled = [...probe.marks].reverse().find((m) => m.name === 'settled');
  if (!release || !settled || settled.t < release.t) return null;
  const during = probe.samples.filter(
    (s) => s.t >= release.t && s.t <= settled.t,
  );
  const gaps = during.slice(1).map((s, i) => s.t - during[i].t);
  return {
    dismissed: Boolean(release.dismiss),
    settleMs: Math.round(settled.t - release.t),
    mainThreadFrames: during.length,
    mainThreadMaxGapMs: gaps.length ? Math.round(Math.max(...gaps)) : 0,
    mainThreadLongFrames: gaps.filter((gap) => gap > 25).length,
    velocity:
      typeof release.velocity === 'number'
        ? Math.round(release.velocity * 100) / 100
        : null,
    styleWrites:
      (settled.styleWrites as number) - (release.styleWrites as number),
  };
}

export function Toolbar({ variant }: { variant: string }) {
  const params = new URLSearchParams(location.search);
  const load = Number(params.get('load') ?? 0);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const probe = window.__probe;
    const original = probe.mark;
    probe.mark = (name, data) => {
      original(name, data);
      if (name !== 'settled') return;
      // Let the last frames land before reading them.
      setTimeout(() => {
        const next = readStats();
        setStats(next);
        if (next)
          console.log(
            `[gesture-test] ${JSON.stringify({ variant, load, ...next })}`,
          );
      }, 50);
    };
    return () => {
      probe.mark = original;
    };
  }, [variant, load]);

  const withLoad = (value: number) => {
    const next = new URLSearchParams(location.search);
    next.set('load', String(value));
    return `${location.pathname}?${next}`;
  };

  return (
    <header className="toolbar">
      <div className="toolbar-row">
        <a className="toolbar-button" href="index.html">
          ← Übersicht
        </a>
        <strong className="toolbar-title">{VARIANT_LABELS[variant]}</strong>
        <button
          className="toolbar-button primary"
          type="button"
          onClick={() => location.reload()}
        >
          Neu
        </button>
      </div>
      <div className="toolbar-row">
        <a
          className={`toolbar-chip${load ? '' : ' active'}`}
          href={withLoad(0)}
        >
          Ohne Last
        </a>
        <a
          className={`toolbar-chip${load ? ' active' : ''}`}
          href={withLoad(24)}
        >
          Mit Last (App rechnet)
        </a>
      </div>
      <p className="toolbar-stats">
        {stats
          ? `${stats.dismissed ? 'Geschlossen' : 'Zurück'} · ${stats.settleMs} ms · Schwung ${stats.velocity ?? '–'} px/ms · ${stats.styleWrites} JS-Schritte (0–1: läuft auf der Grafik, viele: hängt am App-Rechnen)`
          : 'Sheet unten ziehen, wischen oder im Zurückgleiten wieder greifen.'}
      </p>
    </header>
  );
}
