import { type ReactNode, useId, useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import type { CouplePresenceAvatarAction } from './CouplePresence';
import { ShortTaskSheet } from './ShortTaskSheet';

/**
 * Partner-day sheet for Spaces without partner quick actions (#1790 A).
 *
 * With quick actions enabled, the partner block lives in the existing
 * `PartnerQuickActions` sheet. Without them the partner avatar still opens
 * the partner's revealed vibe, battery and note in the same sheet primitive,
 * so a shared note never becomes unreachable.
 */
export function WirPartnerDaySheet({
  partnerName,
  block,
  children,
}: {
  partnerName: string;
  block: ReactNode;
  children: (avatarAction: CouplePresenceAvatarAction) => ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetId = useId();
  return (
    <>
      {children({
        onActivate: () => setOpen((value) => !value),
        label: partnerName,
        ref: triggerRef,
        expanded: open,
        controls: sheetId,
        hasPopup: 'dialog',
      })}
      <ShortTaskSheet
        id={sheetId}
        open={open}
        title={t('wirCheckIn.partnerSheetTitle', { name: partnerName })}
        closeLabel={t('wirCheckIn.partnerSheetClose')}
        onClose={() => setOpen(false)}
        restoreFocusRef={triggerRef}
        className="wir-checkin-partner-sheet"
      >
        {block}
      </ShortTaskSheet>
    </>
  );
}
