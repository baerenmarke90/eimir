import { useState } from 'react';
import {
  appUpdatesAdapter,
  type AppUpdatesAdapter,
} from '../client/appUpdates';
import { useAppUpdateState } from '../client/useAppUpdateState';
import { useTranslation } from '../i18n';

export function AppUpdatesSummary({
  adapter: supplied,
}: {
  adapter?: AppUpdatesAdapter;
}) {
  const { t } = useTranslation();
  const [adapter] = useState(() => supplied ?? appUpdatesAdapter());
  const { state } = useAppUpdateState(adapter);
  return (
    <span>
      {t(state?.available ? 'appUpdates.phases.available' : 'appUpdates.intro')}
    </span>
  );
}
