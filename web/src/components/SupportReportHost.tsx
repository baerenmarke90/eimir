import { Suspense, useEffect, useState } from 'react';
import {
  closeSupportReport,
  type SupportReportRequest,
  useSupportReportRequest,
} from '../client/supportReportLauncher';
import { deferredComponent } from '../deferredModules';

// The sheet, its client code and its styles load in their own chunk: in the
// background after the shell appeared, or on the first request.
const SupportReportSheet = deferredComponent(() =>
  import('./SupportReportSheet').then((module) => module.SupportReportSheet),
);

/**
 * The one support report sheet of the signed-in shell (#2189). Entry points
 * ask for it through `openSupportReport`, so the sheet and its draft stay open
 * when the screen that opened it is replaced or unmounted. It renders nothing
 * until the first request and keeps the last request while closing, so the
 * sheet can leave with its exit motion.
 */
export function SupportReportHost() {
  const request = useSupportReportRequest();
  const [shown, setShown] = useState<SupportReportRequest | null>(request);
  if (request && request !== shown) setShown(request);

  // A request never outlives the shell: signing out or switching the account
  // must not reopen the sheet in the next session.
  useEffect(() => () => closeSupportReport(), []);

  if (!shown) return null;
  return (
    <Suspense fallback={null}>
      <SupportReportSheet
        open={request !== null}
        onClose={closeSupportReport}
        initialKind={shown.kind}
        failure={shown.failure}
      />
    </Suspense>
  );
}
