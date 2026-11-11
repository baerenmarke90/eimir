import { useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './ContextualCreateMenu.css';

export interface ContextualCreateTarget {
  to: string;
  labelKey: string;
  icon: EimirIconName;
}

export function ContextualCreateMenu({
  labelKey,
  targets,
  taskItemKey,
  floating,
}: {
  labelKey: string;
  targets: readonly ContextualCreateTarget[];
  taskItemKey: string;
  floating: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstTargetRef = useRef<HTMLAnchorElement>(null);
  const sheetRef = useRef<ShortTaskSheetHandle>(null);
  const label = t(labelKey);

  return (
    <>
      <AddActionButton
        ref={triggerRef}
        label={label}
        floating={floating}
        data-task-item-key={taskItemKey}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(true)}
      />
      <ShortTaskSheet
        ref={sheetRef}
        id={id}
        open={open}
        title={label}
        className="contextual-create-sheet"
        onClose={() => setOpen(false)}
        initialFocusRef={firstTargetRef}
        restoreFocusRef={triggerRef}
      >
        <div className="contextual-create-choices">
          {targets.map((target, index) => (
            <Link
              key={target.to}
              ref={index === 0 ? firstTargetRef : undefined}
              to={target.to}
              className="contextual-create-choice"
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
                    selectedKey: taskItemKey,
                  });
                  void navigate(target.to, {
                    state: taskOriginKey ? { taskOriginKey } : undefined,
                  });
                });
              }}
            >
              <EimirIcon name={target.icon} />
              <span>{t(target.labelKey)}</span>
            </Link>
          ))}
        </div>
      </ShortTaskSheet>
    </>
  );
}
