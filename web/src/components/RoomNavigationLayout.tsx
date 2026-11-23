import { deferredComponent } from '../deferredModules';

const loadNavigation = () => import('./HomeRoomsNavigation');

export const RoomHeader = deferredComponent(() =>
  loadNavigation().then((layout) => layout.HomeRoomsHeader),
);
export const RoomDock = deferredComponent(() =>
  loadNavigation().then((layout) => layout.HomeRoomsDock),
);
export const RoomLanding = deferredComponent(() =>
  import('./HomeRoomsLanding').then((layout) => layout.HomeRoomsLanding),
);
