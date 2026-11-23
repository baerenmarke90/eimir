import { useSyncExternalStore } from 'react';
import type { FailureReference } from './failureReference';

/**
 * The open support report request (#2189). Entry points ask for the sheet
 * here; the shell's `SupportReportHost` renders it. The sheet therefore
 * outlives the screen that opened it, for example an error state that a
 * background refetch replaces while the person is typing.
 *
 * This module holds only types and a tiny store on purpose: every error state
 * imports it, so it must not pull the sheet or its client code into them.
 */
export interface SupportReportRequest {
  kind: 'PROBLEM' | 'FEEDBACK';
  /** The failure shown where the sheet was opened; problems only. */
  failure?: FailureReference;
}

let current: SupportReportRequest | null = null;
const listeners = new Set<() => void>();

function publish(next: SupportReportRequest | null): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): SupportReportRequest | null {
  return current;
}

export function openSupportReport(request: SupportReportRequest): void {
  publish({ ...request });
}

export function closeSupportReport(): void {
  publish(null);
}

/** The open request, or null while no support report sheet is asked for. */
export function currentSupportReportRequest(): SupportReportRequest | null {
  return current;
}

export function useSupportReportRequest(): SupportReportRequest | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
