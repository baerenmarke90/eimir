// The CSP-safe MapLibre bundle ships without its own typings; it exposes the
// same public API as the package root.
declare module 'maplibre-gl/dist/maplibre-gl-csp.js' {
  import maplibregl from 'maplibre-gl';
  export default maplibregl;
}
