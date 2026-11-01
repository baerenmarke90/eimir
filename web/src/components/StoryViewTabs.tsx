import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { handleTabKeyDown } from '../client/tabKeyboard';
import { useTranslation } from '../i18n';
import './StoryViewTabs.css';

export type StoryView = 'discover' | 'timeline' | 'map';
const views: readonly StoryView[] = ['discover', 'timeline', 'map'];

/** Peer modes share their names, keyboard behavior and selected treatment. */
export function StoryViewTabs({
  activeView,
  onSelect,
}: {
  activeView: StoryView;
  onSelect: (view: StoryView) => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const selectedTab = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if ((location.state as { focusStoryView?: boolean } | null)?.focusStoryView)
      selectedTab.current?.focus({ preventScroll: true });
  }, [location.state]);
  return (
    <div
      className="planen-segmented story-view-tabs"
      role="tablist"
      aria-label={t('story.viewToggleAria')}
      onKeyDown={(event) =>
        handleTabKeyDown(event, (tab) => {
          const view = views.find((value) => tab.id === `momente-tab-${value}`);
          if (view) onSelect(view);
        })
      }
    >
      {views.map((view) => (
        <button
          key={view}
          ref={activeView === view ? selectedTab : undefined}
          type="button"
          role="tab"
          id={`momente-tab-${view}`}
          aria-selected={activeView === view}
          aria-controls={
            activeView === view ? `momente-panel-${view}` : undefined
          }
          tabIndex={activeView === view ? 0 : -1}
          className={`planen-segment ${activeView === view ? 'is-active' : ''}`}
          onClick={() => onSelect(view)}
        >
          {t(
            view === 'map'
              ? 'memoryMap.entry'
              : view === 'discover'
                ? 'story.tabDiscover'
                : 'story.tabTimeline',
          )}
        </button>
      ))}
    </div>
  );
}
