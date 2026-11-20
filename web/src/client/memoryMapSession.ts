import type { MapViewport } from '../components/PlaceMapCanvas';

/**
 * The Momente map's memory for this app session, per account and space. It
 * is held in memory only and never stored: the last camera the couple chose
 * and the Place they last selected, which the Karte segment reopens
 * (Product Owner decision 2026-11-20, #2078).
 */
export interface MemoryMapSession {
  current?: MapViewport;
  place?: string;
}
