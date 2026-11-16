import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export type ProductTourTopic = 'today' | 'story' | 'plan' | 'private';

export function productTourTopicKey(topic: ProductTourTopic): string {
  return `product-tour-${topic}`;
}

type ProductTourContextValue = {
  offerVisible: boolean;
  hideOffer: (permanently: boolean) => void;
  arrivalKey: string | null;
};

const ProductTourContext = createContext<ProductTourContextValue>({
  offerVisible: false,
  hideOffer: () => {},
  arrivalKey: null,
});

export function useProductTour(): ProductTourContextValue {
  return useContext(ProductTourContext);
}

function readDismissal(key: string): boolean {
  try {
    // Preserve the decisions made by the previous introduction.
    return window.localStorage.getItem(key) === 'seen';
  } catch {
    return false;
  }
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
  const key = `eimir:product-tour:v1:${accountId}:${spaceId}`;
  const [offerVisible, setOfferVisible] = useState(() => !readDismissal(key));
  const location = useLocation();
  const navigationType = useNavigationType();
  // Kept primary tabs see their saved location. Only the current push
  // can animate, even when another tab was already mounted.
  const arrivalKey = navigationType === 'PUSH' ? location.key : null;

  const hideOffer = useCallback(
    (permanently: boolean) => {
      setOfferVisible(false);
      if (!permanently) return;
      try {
        window.localStorage.setItem(key, 'seen');
      } catch {
        // Storage can be unavailable, but dismissal still applies in this shell.
      }
    },
    [key],
  );

  const value = useMemo(
    () => ({ offerVisible, hideOffer, arrivalKey }),
    [offerVisible, hideOffer, arrivalKey],
  );

  return (
    <ProductTourContext.Provider value={value}>
      {children}
    </ProductTourContext.Provider>
  );
}
