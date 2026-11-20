import type { AppUpdatesAdapter } from '../client/appUpdates';
import {
  type SettingsStatusOwner,
  useSettingsStatuses,
} from '../client/useSettingsStatuses';
import { SettingsIndex } from './SettingsIndex';

/** The overview with live row statuses; the plain index stays query-free. */
export function SettingsIndexLive({
  updatesAdapter,
  ...owner
}: SettingsStatusOwner & { updatesAdapter?: AppUpdatesAdapter }) {
  return (
    <SettingsIndex
      statuses={useSettingsStatuses(owner)}
      updatesAdapter={updatesAdapter}
    />
  );
}
