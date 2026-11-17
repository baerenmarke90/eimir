import {
  type SettingsStatusOwner,
  useSettingsStatuses,
} from '../client/useSettingsStatuses';
import { SettingsIndex } from './SettingsIndex';

/** The overview with live row statuses; the plain index stays query-free. */
export function SettingsIndexLive(props: SettingsStatusOwner) {
  return <SettingsIndex statuses={useSettingsStatuses(props)} />;
}
