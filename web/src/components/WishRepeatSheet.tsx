import { type FormEvent, type RefObject, useRef, useState } from 'react';
import type { WishDetail } from '../api/generated/models/WishDetail';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { useWishRepeat, type WishRepeatResult } from './useWishRepeat';

/**
 * The "Nochmal erleben" sheet (#1816): the title is an editable proposal,
 * "Wunsch anlegen" creates the follow-up Wish and "Gleich planen" continues
 * into the existing Wish-to-Plan conversion.
 */
export function WishRepeatSheet({
  apis,
  open,
  onClose,
  onDone,
  restoreFocusRef,
  source,
  spaceId,
}: {
  apis: SharedPlanningApis;
  open: boolean;
  onClose: () => void;
  onDone: (result: WishRepeatResult, handle: ShortTaskSheetHandle) => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  source: WishDetail;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(source.title);
  const [choice, setChoice] = useState<'create' | 'plan' | null>(null);
  const repeat = useWishRepeat({ apis, spaceId, source });
  const pending = repeat.isPending;
  const trimmed = title.trim();

  function submit(planNow: boolean) {
    if (!trimmed || pending) return;
    setChoice(planNow ? 'plan' : 'create');
    repeat.mutate(
      { title: trimmed, planNow },
      {
        onSuccess: (result) => {
          if (sheet.current) onDone(result, sheet.current);
        },
      },
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(false);
  }

  return (
    <ShortTaskSheet
      ref={sheet}
      open={open}
      title={t('wishRepeat.sheet.title')}
      className="wish-repeat-sheet"
      initialFocusRef={titleInput}
      restoreFocusRef={restoreFocusRef}
      isCloseBlocked={pending}
      isDirty={trimmed !== source.title}
      onClose={() => {
        repeat.reset();
        setTitle(source.title);
        setChoice(null);
        onClose();
      }}
    >
      <form className="form-grid wish-repeat-form" onSubmit={onSubmit}>
        <p className="wish-repeat-intro">{t('wishRepeat.sheet.intro')}</p>
        <label htmlFor="wish-repeat-title">
          {t('wishRepeat.sheet.titleLabel')}
        </label>
        <input
          id="wish-repeat-title"
          ref={titleInput}
          value={title}
          maxLength={200}
          disabled={pending}
          required
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="form-actions">
          <button type="submit" disabled={pending || !trimmed}>
            {pending && choice === 'create'
              ? t('wishRepeat.sheet.creating')
              : t('wishRepeat.sheet.create')}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={pending || !trimmed}
            onClick={() => submit(true)}
          >
            {pending && choice === 'plan'
              ? t('wishRepeat.sheet.planning')
              : t('wishRepeat.sheet.planNow')}
          </button>
        </div>
        {repeat.error ? <ProblemState error={repeat.error} /> : null}
      </form>
    </ShortTaskSheet>
  );
}
