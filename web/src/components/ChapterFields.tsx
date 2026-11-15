import { useRef, useState } from 'react';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { useTranslation } from '../i18n';
import { NativeDateField } from './NativeDateField';
import { PlaceChoicePicker } from './PlaceChoicePicker';
import { ShortTaskSheet } from './ShortTaskSheet';

export interface ChapterDraft {
  title: string;
  description: string;
  startOn: string;
  endOn: string;
  placeId: string;
}

/** The same optional context and native date contract for capture and correction. */
export function ChapterContextFields({
  apis,
  spaceId,
  draft,
  onChange,
  disabled,
  placeName,
  captureAdmission,
  onPendingChange,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  draft: ChapterDraft;
  onChange: (values: Partial<ChapterDraft>) => void;
  disabled: boolean;
  placeName?: string;
  captureAdmission: () => () => boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const { t } = useTranslation();
  const [choosingPlace, setChoosingPlace] = useState(false);
  const [chosenName, setChosenName] = useState<string>();
  const [placePending, setPlacePending] = useState(false);
  const placeTrigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div className="planning-coordinate-grid">
        <NativeDateField
          id="chapter-start"
          name="startOn"
          label={t('m5s3.chapter.startOn')}
          value={draft.startOn}
          onChange={(event) => onChange({ startOn: event.target.value })}
          disabled={disabled}
          openPickerOnClick
        />
        <NativeDateField
          id="chapter-end"
          name="endOn"
          label={t('m5s3.chapter.endOn')}
          value={draft.endOn}
          min={draft.startOn || undefined}
          onChange={(event) => onChange({ endOn: event.target.value })}
          disabled={disabled}
          openPickerOnClick
        />
      </div>
      <p className="field-help">{t('m5s3.chapter.diaryHint')}</p>
      <div className="chapter-place-choice">
        <button
          ref={placeTrigger}
          type="button"
          className="secondary"
          aria-haspopup="dialog"
          aria-expanded={choosingPlace}
          disabled={disabled}
          onClick={() => setChoosingPlace(true)}
        >
          {draft.placeId
            ? (chosenName ?? placeName ?? t('m5s3.chapter.changePlace'))
            : t('m5s3.chapter.choosePlace')}
        </button>
        {draft.placeId ? (
          <button
            type="button"
            className="tertiary"
            disabled={disabled}
            onClick={() => {
              onChange({ placeId: '' });
              setChosenName(undefined);
            }}
          >
            {t('m5s3.chapter.removePlace')}
          </button>
        ) : null}
      </div>
      <ShortTaskSheet
        open={choosingPlace}
        title={t('m5s3.chapter.choosePlace')}
        restoreFocusRef={placeTrigger}
        isCloseBlocked={placePending}
        onClose={() => setChoosingPlace(false)}
      >
        <PlaceChoicePicker
          api={apis.places}
          spaceId={spaceId}
          queryKey={authorSummaryQueryKeys.placeOptions(spaceId)}
          offline={false}
          confirmSharedCreate
          captureAdmission={captureAdmission}
          onChoose={(place) => {
            onChange({ placeId: place.id });
            setChosenName(place.name);
            setPlacePending(false);
            onPendingChange(false);
            setChoosingPlace(false);
          }}
          onPendingChange={(pending) => {
            setPlacePending(pending);
            onPendingChange(pending);
          }}
        />
      </ShortTaskSheet>
    </>
  );
}
