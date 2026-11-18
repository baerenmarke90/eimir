import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';

/**
 * Android app only (PO decision 2026-11-16): signing out deletes the sealed
 * media key and every locally stored photo, offline read and unsaved draft,
 * so the app names that consequence before it happens.
 */
export function LogoutDeviceDataSheet({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <ShortTaskSheet
      ref={sheet}
      open={open}
      role="alertdialog"
      className="logout-device-data-sheet"
      title={t('header.logoutDeviceTitle')}
      onClose={onCancel}
      initialFocusRef={cancel}
    >
      <p>{t('header.logoutDeviceBody')}</p>
      <p>{t('header.logoutDeviceKept')}</p>
      <div className="form-actions">
        <button
          ref={cancel}
          type="button"
          className="secondary"
          onClick={() => sheet.current?.requestClose()}
        >
          {t('header.logoutDeviceCancel')}
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => sheet.current?.closeForNavigation(onConfirm)}
        >
          {t('header.logout')}
        </button>
      </div>
    </ShortTaskSheet>
  );
}
