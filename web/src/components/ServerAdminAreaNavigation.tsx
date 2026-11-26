import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import {
  AREA_SECTIONS,
  areaForSection,
  type ServerAdminArea,
  type ServerAdminSection,
  sectionHref,
  visibleAreas,
} from './serverAdminAreas';

const AREA_ICONS: Record<ServerAdminArea, EimirIconName> = {
  situation: 'statistiken',
  people: 'gemeinsam',
  help: 'hilfe',
  system: 'einstellungen',
};

function guardLeave(
  event: MouseEvent<HTMLAnchorElement>,
  isCurrent: boolean,
  confirmLeave?: () => boolean,
) {
  if (!isCurrent && confirmLeave && !confirmLeave()) event.preventDefault();
}

/**
 * The ServerAdmin areas: a bottom bar on Compact (the app shell's bar) and a
 * side list on Expanded. Only one is visible at a time; CSS picks it at the
 * shell's 840 px breakpoint.
 */
export function ServerAdminAreaNavigation({
  activeSection,
  supportReportsAvailable,
  supportReportsNew,
  confirmLeave,
}: {
  activeSection: ServerAdminSection;
  /** The overview's `supportReportsOperatorAvailable`: the operator plugin. */
  supportReportsAvailable: boolean;
  supportReportsNew: number;
  /** Asked before another area opens; false keeps the current one. */
  confirmLeave?: () => boolean;
}) {
  const { t } = useTranslation();
  const activeArea = areaForSection(activeSection);
  const areas = visibleAreas({ supportReportsAvailable }).map((area) => {
    const unread = area === 'help' && supportReportsNew > 0;
    return {
      area,
      href: sectionHref(AREA_SECTIONS[area][0]),
      label: t(`serverAdmin.areas.${area}`),
      name: unread
        ? t('serverAdmin.areas.helpUnread', { count: supportReportsNew })
        : undefined,
      unread,
      isCurrent: area === activeArea,
    };
  });

  return (
    <>
      <nav
        className="server-admin-area-nav-side"
        aria-label={t('serverAdmin.areas.aria')}
      >
        {areas.map((item) => (
          <Link
            key={item.area}
            className="server-admin-area-link"
            to={item.href}
            aria-current={item.isCurrent ? 'page' : undefined}
            aria-label={item.name}
            onClick={(event) => guardLeave(event, item.isCurrent, confirmLeave)}
          >
            <EimirIcon
              name={AREA_ICONS[item.area]}
              variant={item.isCurrent ? 'filled' : 'outline'}
            />
            <span className="server-admin-area-label">{item.label}</span>
            {item.unread ? (
              <span className="server-admin-area-count" aria-hidden="true">
                {supportReportsNew}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
      <div className="mobile-bottom-shell server-admin-area-bar">
        <nav
          className="mobile-bottom-nav server-admin-area-nav-compact"
          aria-label={t('serverAdmin.areas.aria')}
        >
          {areas.map((item) => (
            <Link
              key={item.area}
              className={`shell-nav-link${item.isCurrent ? ' shell-nav-link-active' : ''}`}
              to={item.href}
              aria-current={item.isCurrent ? 'page' : undefined}
              aria-label={item.name}
              onClick={(event) =>
                guardLeave(event, item.isCurrent, confirmLeave)
              }
            >
              <span className="shell-nav-icon">
                <EimirIcon
                  name={AREA_ICONS[item.area]}
                  variant={item.isCurrent ? 'filled' : 'outline'}
                />
                {item.unread ? (
                  <span className="notification-dot" aria-hidden="true" />
                ) : null}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}

/** The pages of the active area, as pills; absent for one-page areas. */
export function ServerAdminSubNavigation({
  activeSection,
  confirmLeave,
}: {
  activeSection: ServerAdminSection;
  confirmLeave?: () => boolean;
}) {
  const { t } = useTranslation();
  const sections = AREA_SECTIONS[areaForSection(activeSection)];
  if (sections.length < 2) return null;
  return (
    <nav
      className="server-admin-subnav"
      aria-label={t('serverAdmin.subNavigation.aria')}
    >
      {sections.map((section) => {
        const isCurrent = section === activeSection;
        return (
          <Link
            key={section}
            className="server-admin-subnav-link"
            to={sectionHref(section)}
            aria-current={isCurrent ? 'page' : undefined}
            onClick={(event) => guardLeave(event, isCurrent, confirmLeave)}
          >
            {t(`serverAdmin.navigation.${section}`)}
          </Link>
        );
      })}
    </nav>
  );
}
