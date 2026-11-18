import { safeWishLink, wishLinkHost } from '../client/wishLinkPhoto';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './WishLinkPhoto.css';

/**
 * The link of a Wish as one findable row: the host in reading size and an
 * explicit open action. The address opens in a new browsing context without
 * handing over the opener or the referrer; an address that is not a safe web
 * link is not rendered at all.
 */
export function WishLinkRow({
  url,
  className = '',
}: {
  url: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const href = safeWishLink(url);
  if (!href) return null;
  const host = wishLinkHost(href);
  return (
    <a
      className={`wish-link-row ${className}`.trim()}
      href={href}
      target="_blank"
      rel="noopener noreferrer external"
      referrerPolicy="no-referrer"
      aria-label={t('m5s3.wish.link.openNamed', { host })}
    >
      <EimirIcon name="link" />
      <span className="wish-link-host">{host}</span>
      <span className="wish-link-open" aria-hidden="true">
        {t('m5s3.wish.link.open')}
        <EimirIcon name="external-link" />
      </span>
    </a>
  );
}
