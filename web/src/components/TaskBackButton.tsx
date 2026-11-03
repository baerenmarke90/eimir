import type { ButtonHTMLAttributes } from 'react';
import { useTranslation } from '../i18n';

/** Shared Plan/Story appearance; the owning task decides the safe destination. */
export function TaskBackButton({
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={`back-link tertiary ${className}`}
      {...props}
    >
      {children ?? t('taskBoundary.back')}
    </button>
  );
}
