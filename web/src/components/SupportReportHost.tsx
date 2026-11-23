import { useEffect, useState } from 'react';
import {
  closeSupportReport,
  type SupportReportRequest,
  useSupportReportRequest,
} from '../client/supportReportLauncher';
import { SupportReportSheet } from './SupportReportSheet';

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

  // A static import on purpose: the host is shell-only, so error states do
  // not import the sheet, and opening it never waits for or fails on a chunk
  // load (offline, Save-Data or an early tap).
  if (!shown) return null;
  return (
    <SupportReportSheet
      open={request !== null}
      onClose={closeSupportReport}
      initialKind={shown.kind}
      failure={shown.failure}
    />
  );
}
