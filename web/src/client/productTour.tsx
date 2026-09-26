import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { appRoutePath } from './routes';
import { useTranslation } from '../i18n';
import './productTour.css';

type TourStep = 'today' | 'story' | 'plan' | 'create';
const STEPS: readonly TourStep[] = ['today', 'story', 'plan', 'create'];
const TOUR_STORAGE_VERSION = 'v1';

function storageKey(accountId: string, spaceId: string): string {
  return `eimir:product-tour:${TOUR_STORAGE_VERSION}:${accountId}:${spaceId}`;
}

function wasSeen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'seen';
  } catch {
    return false;
  }
}

function rememberSeen(key: string): void {
  try {
    window.localStorage.setItem(key, 'seen');
  } catch {
    // The current session still remains dismissible and replayable.
  }
}

type ProductTourContextValue = { replay: () => void };
const ProductTourContext = createContext<ProductTourContextValue>({
  replay: () => {},
});

export function useProductTour(): ProductTourContextValue {
  return useContext(ProductTourContext);
}

export function ProductTourProvider({
  accountId,
  spaceId,
  children,
}: {
  accountId: string;
  spaceId: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const key = storageKey(accountId, spaceId);
  const [seen, setSeen] = useState(() => wasSeen(key));
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousPathRef = useRef(location.pathname);

  const finish = useCallback(() => {
    setStepIndex(null);
    setSeen(true);
    rememberSeen(key);
    window.requestAnimationFrame(() => {
      document.getElementById('main-content')?.focus({ preventScroll: true });
    });
  }, [key]);

  const replay = useCallback(() => {
    setSeen(true);
    rememberSeen(key);
    setStepIndex(0);
    void navigate(appRoutePath('today'));
  }, [key, navigate]);

  const value = useMemo(() => ({ replay }), [replay]);
  const isInvite = !seen && location.pathname === appRoutePath('more');
  const step = stepIndex === null ? null : STEPS[stepIndex];
  const expectedPath =
    step === 'create' ? appRoutePath('plan') : step ? appRoutePath(step) : null;
  const isTourVisible = Boolean(step && location.pathname === expectedPath);

  useEffect(() => {
    if (!isTourVisible || !step) return;
    headingRef.current?.focus({ preventScroll: true });
  }, [isTourVisible, step]);

  useEffect(() => {
    if (!isInvite && !isTourVisible) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [finish, isInvite, isTourVisible]);

  useEffect(() => {
    const previousPath = previousPathRef.current;
    previousPathRef.current = location.pathname;
    if (
      stepIndex === null ||
      previousPath === location.pathname ||
      isTourVisible
    )
      return;
    // Ordinary navigation wins over the optional orientation.
    setStepIndex(null);
  }, [isTourVisible, location.pathname, stepIndex]);

  function next(): void {
    if (stepIndex === null) return;
    const nextIndex = stepIndex + 1;
    if (nextIndex >= STEPS.length) {
      finish();
      return;
    }
    setStepIndex(nextIndex);
    const nextStep = STEPS[nextIndex];
    if (nextStep !== 'create') void navigate(appRoutePath(nextStep));
  }

  function openQuickCreate(): void {
    setStepIndex(null);
    setSeen(true);
    rememberSeen(key);
    const selector = window.matchMedia('(max-width: 839px)').matches
      ? '.mobile-quick-create .quick-create-trigger'
      : '.shell-primary-action .quick-create-trigger';
    document.querySelector<HTMLButtonElement>(selector)?.click();
  }

  return (
    <ProductTourContext.Provider value={value}>
      {children}
      {isInvite || isTourVisible ? (
        <aside className="product-tour" aria-labelledby="product-tour-title">
          <div className="product-tour-copy">
            <span className="product-tour-eyebrow">
              {t('productTour.eyebrow')}
              {stepIndex !== null ? ` · ${stepIndex + 1}/${STEPS.length}` : ''}
            </span>
            <h2 id="product-tour-title" ref={headingRef} tabIndex={-1}>
              {t(`productTour.${step ?? 'invite'}.title`)}
            </h2>
            <p>{t(`productTour.${step ?? 'invite'}.body`)}</p>
          </div>
          <div className="product-tour-actions">
            <button type="button" className="button tertiary" onClick={finish}>
              {t('productTour.later')}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={
                isInvite ? replay : step === 'create' ? openQuickCreate : next
              }
            >
              {t(
                isInvite
                  ? 'productTour.start'
                  : step === 'create'
                    ? 'productTour.openCreate'
                    : 'productTour.next',
              )}
            </button>
          </div>
        </aside>
      ) : null}
    </ProductTourContext.Provider>
  );
}
