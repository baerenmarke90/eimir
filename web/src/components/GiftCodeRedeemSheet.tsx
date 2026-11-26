import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import type { GiftCodeRedemptionView } from '../api/generated/models/GiftCodeRedemptionView';
import { useApiRuntime } from '../client/apiRuntimeContext';
import {
  type GiftCodeProblem,
  type GiftCodeRedeemer,
  giftCodeProblem,
  useGiftCodesAvailable,
  useRedeemGiftCode,
} from '../client/giftCodes';
import { resolvedLocale, useTranslation } from '../i18n';
import { feedback } from '../motion/feedback';
import { EimirIcon } from './EimirIcon';
import { ShortTaskSheet } from './ShortTaskSheet';
import './GiftCodeRedeemSheet.css';

/** Room for a pasted code with spaces; the server accepts up to 64. */
const CODE_FIELD_MAX_LENGTH = 64;

/** Problems about the typed code itself; the others concern the Space. */
const FIELD_PROBLEMS: ReadonlySet<GiftCodeProblem> = new Set([
  'invalid',
  'used',
]);

export interface GiftCodeRedeemSheetProps {
  open: boolean;
  onClose: () => void;
  /** Replaces the generated client; for tests. */
  api?: GiftCodeRedeemer;
  /** Whether the sheet is on screen, its exit included. */
  onPresenceChange?: (present: boolean) => void;
}

/**
 * Redeeming an eimir. gift code (part 5, #2328): a short hint, one large code
 * field and one filled "redeem" action. A confirmed code turns the sheet into
 * a calm confirmation with the new end date; refused codes are explained next
 * to the field and the typed code stays. Web only; the entry decides that.
 */
export function GiftCodeRedeemSheet(props: GiftCodeRedeemSheetProps) {
  const spaceId = useApiRuntime()?.spaceId;
  if (!spaceId) return null;
  return <GiftCodeRedeemSheetContent {...props} spaceId={spaceId} />;
}

function GiftCodeRedeemSheetContent({
  open,
  onClose,
  api,
  onPresenceChange,
  spaceId,
}: GiftCodeRedeemSheetProps & { spaceId: string }) {
  const { t } = useTranslation();
  const redeem = useRedeemGiftCode(spaceId, api);
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<GiftCodeProblem | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<GiftCodeRedemptionView | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const problemRef = useRef<HTMLParagraphElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const baseId = useId();
  const formId = `${baseId}-form`;
  const fieldId = `${baseId}-code`;
  const hintId = `${baseId}-hint`;
  const problemId = `${baseId}-error`;
  const pending = redeem.isPending;

  // The result receives focus: the explanation after a refused attempt (it is
  // also the field's description), the confirmation after a redeemed code.
  useEffect(() => {
    if (attempt > 0 && problem) problemRef.current?.focus();
  }, [attempt, problem]);

  useEffect(() => {
    if (!result) return;
    resultRef.current?.focus();
    // The shared success beat (Motion Contract 4.3) with its haptic; reduced
    // motion shows the confirmed state at once. No celebration.
    feedback(markRef.current, 'success', { haptic: true });
  }, [result]);

  function close() {
    // A redeemed code leaves nothing behind; a typed one is kept for later.
    if (result) {
      setResult(null);
      setCode('');
      setProblem(null);
      redeem.reset();
    }
    onClose();
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (pending || code.trim() === '') return;
    // The field shows capitals through CSS so editing mid-code keeps the
    // caret; the server normalizes the rest (spaces, dashes, prefix).
    redeem.mutate(code.toUpperCase(), {
      onSuccess: (redemption) => {
        setProblem(null);
        setResult(redemption);
      },
      onError: (error) => {
        setProblem(giftCodeProblem(error));
        setAttempt((count) => count + 1);
      },
    });
  }

  const outcome = result?.extended ? 'extended' : 'new';
  const until = result
    ? new Intl.DateTimeFormat(resolvedLocale(), { dateStyle: 'long' }).format(
        result.effectiveUntil,
      )
    : '';

  return (
    <ShortTaskSheet
      open={open}
      title={
        result
          ? t(`proPaywall.giftCode.success.${outcome}.title`)
          : t('proPaywall.giftCode.title')
      }
      onClose={close}
      onPresenceChange={onPresenceChange}
      initialFocusRef={result ? resultRef : fieldRef}
      className={`gift-code-redeem-sheet${result ? ' gift-code-redeem-sheet-redeemed' : ''}`}
      footer={
        result ? (
          <button
            type="button"
            className="button-link button-link-primary gift-code-redeem-action"
            onClick={close}
          >
            {t('proPaywall.giftCode.done')}
          </button>
        ) : (
          <button
            type="submit"
            form={formId}
            className="button-link button-link-primary gift-code-redeem-action"
            disabled={code.trim() === '' && !pending}
            aria-disabled={pending || undefined}
          >
            {pending
              ? t('proPaywall.giftCode.redeeming')
              : t('proPaywall.giftCode.redeem')}
          </button>
        )
      }
    >
      {result ? (
        <>
          {/* Decorative; the stylesheet shows it above the centred title. */}
          <span
            ref={markRef}
            className="gift-code-redeem-mark"
            aria-hidden="true"
          >
            <EimirIcon name="geschenk" variant="duotone" />
          </span>
          <p ref={resultRef} tabIndex={-1} className="gift-code-redeem-result">
            {/* The visible title already says it; read together on focus. */}
            <span className="sr-only">
              {t(`proPaywall.giftCode.success.${outcome}.title`)}{' '}
            </span>
            {t(`proPaywall.giftCode.success.${outcome}.body`, { date: until })}
          </p>
        </>
      ) : (
        <form
          id={formId}
          className="gift-code-redeem-form"
          noValidate
          onSubmit={submit}
        >
          <p id={hintId} className="gift-code-redeem-hint">
            {t('proPaywall.giftCode.hint')}
          </p>
          <label className="gift-code-redeem-label" htmlFor={fieldId}>
            {t('proPaywall.giftCode.fieldLabel')}
          </label>
          <input
            ref={fieldRef}
            id={fieldId}
            className="gift-code-redeem-field"
            type="text"
            value={code}
            placeholder={t('proPaywall.giftCode.placeholder')}
            maxLength={CODE_FIELD_MAX_LENGTH}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            readOnly={pending}
            aria-describedby={problem ? `${hintId} ${problemId}` : hintId}
            aria-invalid={(problem && FIELD_PROBLEMS.has(problem)) || undefined}
            onChange={(event) => {
              setCode(event.target.value);
              setProblem(null);
            }}
          />
          {problem ? (
            <p
              ref={problemRef}
              id={problemId}
              tabIndex={-1}
              className="gift-code-redeem-problem"
            >
              {t(`proPaywall.giftCode.errors.${problem}`)}
            </p>
          ) : null}
        </form>
      )}
    </ShortTaskSheet>
  );
}

/**
 * The quiet way into the redeem sheet: a tertiary text button with the gift
 * motif, never the filled primary action of its page. It renders only in the
 * browser on an instance that offers gift codes. An open sheet stays until it
 * is closed, even when a later status read (a failed background refetch, or
 * the feature switched off) withdraws the entry: the typed code or the
 * confirmation never vanishes under the couple's hands.
 */
export function GiftCodeRedeemEntry({
  className = '',
}: {
  className?: string;
}) {
  const { t } = useTranslation();
  const available = useGiftCodesAvailable();
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  if (!available && !open && !present) return null;
  return (
    <>
      {available ? (
        <button
          type="button"
          className={`tertiary gift-code-redeem-entry ${className}`.trim()}
          onClick={() => setOpen(true)}
        >
          <EimirIcon name="geschenk" />
          <span>{t('proPaywall.giftCode.title')}</span>
        </button>
      ) : null}
      <GiftCodeRedeemSheet
        open={open}
        onClose={() => setOpen(false)}
        onPresenceChange={setPresent}
      />
    </>
  );
}
