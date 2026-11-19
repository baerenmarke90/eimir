import { useTranslation } from '../i18n';

export function WishSelectionWishPicker({
  wishItems,
  candidateIds,
  full,
  onToggle,
}: {
  wishItems: readonly { id: string; title: string }[];
  candidateIds: readonly string[];
  full: boolean;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="wish-selection-choices">
      <legend className="sr-only">{t('wishSelection.openWishes')}</legend>
      {wishItems.map((wish) => (
        <label key={wish.id} className="wish-selection-choice">
          <input
            type="checkbox"
            checked={candidateIds.includes(wish.id)}
            disabled={!candidateIds.includes(wish.id) && full}
            onChange={() => onToggle(wish.id)}
          />
          <span>{wish.title}</span>
        </label>
      ))}
    </fieldset>
  );
}
