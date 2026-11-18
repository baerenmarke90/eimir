import { useNavigate } from 'react-router-dom';
import { MORE_COLLECTIONS_ROUTE, MORE_NOTES_ROUTE } from '../client/routes';
import { handleTabKeyDown } from '../client/tabKeyboard';
import { useTranslation } from '../i18n';
import './StoryViewTabs.css';

export type SharedContentView = 'lists' | 'notes';

const views: readonly {
  view: SharedContentView;
  path: string;
  labelKey: string;
}[] = [
  {
    view: 'lists',
    path: MORE_COLLECTIONS_ROUTE,
    labelKey: 'navigation.sharedLists',
  },
  { view: 'notes', path: MORE_NOTES_ROUTE, labelKey: 'navigation.sharedNotes' },
];

/**
 * Peer modes of the Gemeinsam destination. Lists and Notes keep their own
 * addresses, so deep links and task origins stay valid; switching replaces the
 * history entry because the two views are siblings, not a drill-down.
 */
export function SharedContentTabs({
  activeView,
}: {
  activeView: SharedContentView;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const select = (view: SharedContentView) => {
    if (view === activeView) return;
    const target = views.find((entry) => entry.view === view);
    if (target) void navigate(target.path, { replace: true });
  };
  return (
    <div
      className="planen-segmented story-view-tabs"
      role="tablist"
      aria-label={t('navigation.sharedViewsAria')}
      onKeyDown={(event) =>
        handleTabKeyDown(event, (tab) => {
          const entry = views.find(
            (item) => tab.id === `shared-tab-${item.view}`,
          );
          if (entry) select(entry.view);
        })
      }
    >
      {views.map(({ view, labelKey }) => (
        <button
          key={view}
          type="button"
          role="tab"
          id={`shared-tab-${view}`}
          aria-selected={activeView === view}
          tabIndex={activeView === view ? 0 : -1}
          className={`planen-segment ${activeView === view ? 'is-active' : ''}`}
          onClick={() => select(view)}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}
