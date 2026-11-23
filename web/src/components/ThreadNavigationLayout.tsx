import { deferredComponent } from '../deferredModules';

const load = () => import('./TogetherIndex');
export const ThreadHeader = deferredComponent(() =>
  load().then((m) => m.ThreadHeader),
);
export const ThreadDock = deferredComponent(() =>
  load().then((m) => m.ThreadDock),
);
export const ThreadIndexRoute = deferredComponent(() =>
  load().then((m) => m.ThreadIndexRoute),
);
export const ThreadToday = deferredComponent(() =>
  load().then((m) => m.ThreadToday),
);
