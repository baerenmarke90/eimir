import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PRIVATE_GIFT_IDEAS_PATH } from '../client/privateArea';
import { useDismissiblePopover } from '../client/useDismissiblePopover';
import {
  type AppRouteIcon,
  COLLECTION_CREATE_ROUTE,
  HEART_MOMENT_CREATE_ROUTE,
  MEMORY_CREATE_ROUTE,
  MILESTONE_CREATE_ROUTE,
  MORE_PRIVATE_ROUTE,
  PLAN_CREATE_ROUTE,
  WISH_CREATE_ROUTE,
} from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { DestinationIcon } from './DestinationIcon';
import { ONCE_CREATE_ROUTE } from '../client/onceMessages';
import { ProMark } from './ProMark';
import './QuickCreateMenu.css';

const PRIVATE_NOTE_CREATE_ROUTE = `${MORE_PRIVATE_ROUTE}/notes/new`;
const PRIVATE_GIFT_IDEA_CREATE_ROUTE = `${PRIVATE_GIFT_IDEAS_PATH}/new`;
type QuickCreateTarget = {
  id: string;
  labelKey: string;
  sublineKey: string;
  to: string;
  icon: AppRouteIcon;
  tone: 'story' | 'planning' | 'private';
};

const SHARED_TARGETS: readonly QuickCreateTarget[] = [
  {
    id: 'memory',
    labelKey: 'navigation.quickCreateMemory',
    sublineKey: 'navigation.quickCreateMemorySubline',
    to: MEMORY_CREATE_ROUTE,
    icon: 'story',
    tone: 'story',
  },
  {
    id: 'heart-moment',
    labelKey: 'navigation.quickCreateHeartMoment',
    sublineKey: 'navigation.quickCreateHeartMomentSubline',
    to: HEART_MOMENT_CREATE_ROUTE,
    icon: 'today',
    tone: 'story',
  },
  {
    id: 'only-you',
    labelKey: 'onceMessages.title',
    sublineKey: 'onceMessages.singleView',
    to: ONCE_CREATE_ROUTE,
    icon: 'private',
    tone: 'private',
  },
  {
    id: 'milestone',
    labelKey: 'navigation.quickCreateMilestone',
    sublineKey: 'navigation.quickCreateMilestoneSubline',
    to: MILESTONE_CREATE_ROUTE,
    icon: 'milestone',
    tone: 'story',
  },
  {
    id: 'wish',
    labelKey: 'navigation.quickCreateWish',
    sublineKey: 'navigation.quickCreateWishSubline',
    to: WISH_CREATE_ROUTE,
    icon: 'wish',
    tone: 'planning',
  },
  {
    id: 'collection',
    labelKey: 'navigation.quickCreateCollection',
    sublineKey: 'navigation.quickCreateCollectionSubline',
    to: COLLECTION_CREATE_ROUTE,
    icon: 'collections',
    tone: 'planning',
  },
  {
    id: 'plan',
    labelKey: 'navigation.quickCreatePlan',
    sublineKey: 'navigation.quickCreatePlanSubline',
    to: PLAN_CREATE_ROUTE,
    icon: 'plan',
    tone: 'planning',
  },
];

const FOR_ME_TARGETS: readonly QuickCreateTarget[] = [
  {
    id: 'note',
    labelKey: 'navigation.quickCreatePrivateNote',
    sublineKey: 'navigation.quickCreatePrivateNoteSubline',
    to: PRIVATE_NOTE_CREATE_ROUTE,
    icon: 'private',
    tone: 'private',
  },
  {
    id: 'gift-idea',
    labelKey: 'navigation.quickCreateGiftIdea',
    sublineKey: 'navigation.quickCreateGiftIdeaSubline',
    to: PRIVATE_GIFT_IDEA_CREATE_ROUTE,
    icon: 'gift',
    tone: 'private',
  },
];

export function QuickCreateMenu() {
  const { t } = useTranslation();
  const menuId = useId();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const focusFirstItemOnOpenRef = useRef(false);
  const {
    isOpen: open,
    open: openMenu,
    close,
    toggle,
    triggerRef,
    panelRef,
  } = useDismissiblePopover({
    // Quick Create is a persistent shell action. Target handoff closes it
    // explicitly, while outside/Escape own ordinary dismissal. Inheriting the
    // generic route auto-dismiss would race with opening it immediately after
    // shell navigation.
    closeOnRouteChange: false,
  });

  useEffect(() => {
    if (!open) {
      focusFirstItemOnOpenRef.current = false;
      return;
    }
    if (!focusFirstItemOnOpenRef.current) return;
    focusFirstItemOnOpenRef.current = false;
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, panelRef]);

  function openTarget(target: QuickCreateTarget): void {
    const taskOriginKey = [
      'only-you',
      'memory',
      'heart-moment',
      'milestone',
      'wish',
      'plan',
      'note',
      'gift-idea',
      'collection',
    ].includes(target.id)
      ? captureOrigin({
          focusTarget: 'quick-create',
          planningSegment:
            target.id === 'wish'
              ? 'wishes'
              : target.id === 'plan'
                ? 'plans'
                : undefined,
        })
      : null;
    close();
    void navigate(target.to, {
      state: taskOriginKey ? { taskOriginKey } : undefined,
    });
  }

  function focusMenuItem(index: number): void {
    const items =
      panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!items?.length) return;
    items[(index + items.length) % items.length]?.focus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    if (open) {
      focusMenuItem(0);
      return;
    }
    focusFirstItemOnOpenRef.current = true;
    openMenu();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
        [],
    );
    if (!items.length) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusMenuItem(currentIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusMenuItem(currentIndex <= 0 ? items.length - 1 : currentIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusMenuItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusMenuItem(items.length - 1);
    }
  }

  function renderDesktopTarget(target: QuickCreateTarget) {
    const sublineId = `${menuId}-subline-${target.id}`;
    return (
      <Link
        key={target.labelKey}
        role="menuitem"
        className={`quick-create-menu-item quick-create-tile quick-create-tile-${target.tone}`}
        to={target.to}
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          openTarget(target);
        }}
        aria-label={t(target.labelKey)}
        aria-describedby={sublineId}
      >
        <span className="quick-create-tile-icon" aria-hidden="true">
          <DestinationIcon icon={target.icon} />
        </span>
        <span className="quick-create-tile-content">
          <span className="quick-create-tile-title">
            {t(target.labelKey)}{' '}
            {target.id === 'only-you' ? <ProMark label="Pro" /> : null}
          </span>
          <span id={sublineId} className="quick-create-tile-subline">
            {t(target.sublineKey)}
          </span>
        </span>
      </Link>
    );
  }

  return (
    <div
      className="quick-create quick-create-polished"
      ref={panelRef as RefObject<HTMLDivElement>}
    >
      <button
        ref={triggerRef as RefObject<HTMLButtonElement>}
        type="button"
        className="button-link quick-create-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('navigation.newContent')}
        title={t('navigation.newContent')}
        onClick={toggle}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="shell-nav-icon" aria-hidden="true">
          <DestinationIcon icon="add" />
        </span>
        <span>{t('navigation.newContent')}</span>
      </button>

      {open ? (
        <div
          id={menuId}
          className="quick-create-menu"
          role="menu"
          aria-label={t('navigation.quickCreateTitle')}
          onKeyDown={handleMenuKeyDown}
        >
          <div className="quick-create-header-title">
            {t('navigation.quickCreateTitle')}
          </div>
          <div className="quick-create-tile-grid">
            {SHARED_TARGETS.map(renderDesktopTarget)}
          </div>

          <hr className="quick-create-separator" />
          <div className="quick-create-group-label quick-create-for-me-label">
            {t('navigation.quickCreateForMe')}
          </div>
          <div className="quick-create-tile-grid">
            {FOR_ME_TARGETS.map(renderDesktopTarget)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
