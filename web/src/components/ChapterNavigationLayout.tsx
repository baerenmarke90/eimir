import { deferredComponent } from '../deferredModules';

const load = () => import('./SharedRhythm');

export const ChapterNavigation = deferredComponent(() =>
  load().then((layout) => layout.SharedRhythmRail),
);

export const ChapterToday = deferredComponent(() =>
  load().then((layout) => layout.SharedRhythmToday),
);
