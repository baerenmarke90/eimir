import { AddActionContent } from './AddAction';
import type { EimirIconName } from './EimirIcon';
import { TaskOriginLink } from './TodayDestinationLink';

/**
 * The one filled action of an empty area (#1907 I1). It opens the existing
 * composer with the same task-return contract as other content links.
 */
export function FirstStepAction({
  to,
  label,
  icon,
  selectedKey,
}: {
  to: string;
  label: string;
  icon?: EimirIconName;
  selectedKey: string;
}) {
  return (
    <TaskOriginLink
      to={to}
      selectedKey={selectedKey}
      className="button-link add-action first-step-action"
      ariaLabel={label}
    >
      <AddActionContent label={label} icon={icon} />
    </TaskOriginLink>
  );
}
