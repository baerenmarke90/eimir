import { useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  HEART_MOMENT_CREATE_ROUTE,
  MEMORY_CREATE_ROUTE,
  MILESTONE_CREATE_ROUTE,
} from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './MomentCreateMenu.css';

const targets = [
  { to: MEMORY_CREATE_ROUTE, label: 'memory', icon: 'erinnerungen' },
  { to: HEART_MOMENT_CREATE_ROUTE, label: 'heartMoment', icon: 'denken' },
  { to: MILESTONE_CREATE_ROUTE, label: 'milestone', icon: 'meilensteine' },
] as const satisfies readonly {
  to: string;
  label: string;
  icon: EimirIconName;
}[];

/** A bounded local entry into the existing moment capture tasks. */
export function MomentCreateMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstTargetRef = useRef<HTMLAnchorElement>(null);
  const sheetRef = useRef<ShortTaskSheetHandle>(null);

  return (
    <div className="moment-create">
      <AddActionButton
        ref={triggerRef}
        label={t('story.addMoment')}
        data-task-item-key="moment-create"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(true)}
      />
      <ShortTaskSheet
        ref={sheetRef}
        id={id}
        open={open}
        title={t('story.addMoment')}
        onClose={() => setOpen(false)}
        initialFocusRef={firstTargetRef}
        restoreFocusRef={triggerRef}
      >
        <div className="moment-create-choices">
          {targets.map((target, index) => (
            <Link
              key={target.to}
              ref={index === 0 ? firstTargetRef : undefined}
              to={target.to}
              className="moment-create-choice"
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
                sheetRef.current?.closeForNavigation(() => {
                  const taskOriginKey = captureOrigin({
                    selectedKey: 'moment-create',
                  });
                  void navigate(target.to, {
                    state: taskOriginKey ? { taskOriginKey } : undefined,
                  });
                });
              }}
            >
              <EimirIcon name={target.icon} />
              <span>{t(`story.kind.${target.label}`)}</span>
            </Link>
          ))}
        </div>
      </ShortTaskSheet>
    </div>
  );
}
