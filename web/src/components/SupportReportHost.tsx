import { useEffect, useReducer, useState } from 'react';
import {
  closeSupportReport,
  currentSupportReportRequest,
  type SupportReportRequest,
  useSupportReportRequest,
} from '../client/supportReportLauncher';
import { deferredModule } from '../deferredModules';

/**
 * The sheet, its draft hook, client and styles live in their own chunk, so
 * they stay out of the startup bundle. The background prefetch normally loads
 * it shortly after the shell appeared, so a tap opens the sheet at once.
 */
export const supportReportSheetModule = deferredModule(() =>
  import('./SupportReportSheet').then((module) => module.SupportReportSheet),
);

/**
 * The one support report sheet of the signed-in shell (#2189). Entry points
 * ask for it through `openSupportReport`, so the sheet and its draft stay open
 * when the screen that opened it is replaced or unmounted. It renders nothing
 * until the first request and keeps the last request while closing, so the
 * sheet can leave with its exit motion.
 *
 * A failed chunk load (offline before the prefetch ran, Save-Data, an early
 * tap) is harmless: the host renders nothing, never suspends or throws into
 * the shell, tries once more and otherwise closes the request, so the next
 * tap loads again. Errors of the loaded sheet itself are not caught here.
 */
export function SupportReportHost() {
  const request = useSupportReportRequest();
  const [, sheetLoaded] = useReducer((count: number) => count + 1, 0);
  const Sheet = supportReportSheetModule.current();
  const [shown, setShown] = useState<SupportReportRequest | null>(
    Sheet ? request : null,
  );
  if (Sheet && request && request !== shown) setShown(request);

  // A request never outlives the shell: signing out or switching the account
  // must not reopen the sheet in the next session.
  useEffect(() => () => closeSupportReport(), []);

  useEffect(() => {
    if (Sheet || !request) return;
    let live = true;
    supportReportSheetModule
      .load()
      // One more attempt covers a fetch that failed in passing.
      .catch(() => supportReportSheetModule.load())
      .then(
        () => {
          if (live) sheetLoaded();
        },
        () => {
          // Close the request that could not open, so the next tap asks
          // again and loads the chunk anew.
          if (live && currentSupportReportRequest() === request)
            closeSupportReport();
        },
      );
    return () => {
      live = false;
    };
  }, [Sheet, request]);

  if (!Sheet || !shown) return null;
  return (
    <Sheet
      open={request !== null}
      onClose={closeSupportReport}
      initialKind={shown.kind}
      failure={shown.failure}
    />
  );
}
