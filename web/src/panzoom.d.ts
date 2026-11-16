// The package's ESM distribution has the same public API as its typed root.
// Select it explicitly: the root's Node entry is UMD despite type:module.
declare module '@panzoom/panzoom/dist/panzoom.es.js' {
  const Panzoom: typeof import('@panzoom/panzoom').default;
  export default Panzoom;
}
