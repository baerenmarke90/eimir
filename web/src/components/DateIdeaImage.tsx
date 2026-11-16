import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { DateIdeasApi } from '../api/generated/apis/DateIdeasApi';
import type { DateIdeaImage as DateIdeaImageView } from '../api/generated/models/DateIdeaImage';
import { dateIdeaImageQueryKey } from '../client/dateIdeas';
import { normalizeClientError } from '../client/problemDetails';

/**
 * Editorial catalog image for one idea (#1892). The bytes come from the
 * Pro-gated API and live only in the Account/Space query cache, never in a
 * public asset or durable storage. Loading starts when the card approaches the
 * viewport; the 3:2 frame is reserved up front so nothing shifts. A failed
 * image leaves the calm placeholder surface; the idea stays fully usable.
 */
export function DateIdeaImage({
  api,
  accountId,
  spaceId,
  image,
  lang,
  decorative = false,
}: {
  api: Pick<DateIdeasApi, 'getDateIdeaImage'>;
  accountId: string;
  spaceId: string;
  image: DateIdeaImageView;
  lang?: string;
  /** A thumbnail next to the idea's title repeats nothing for screen readers. */
  decorative?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );
  useEffect(() => {
    const element = frame.current;
    if (near || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);

  const blob = useQuery({
    queryKey: dateIdeaImageQueryKey(accountId, spaceId, image.id),
    queryFn: async ({ signal }) => {
      try {
        return await api.getDateIdeaImage(
          { spaceId, imageId: image.id },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: near,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 10 * 60_000,
    retry: false,
  });

  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob.data || typeof URL.createObjectURL !== 'function') return;
    const next = URL.createObjectURL(blob.data);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
      setUrl(null);
    };
  }, [blob.data]);

  return (
    <div
      ref={frame}
      className="date-idea-media"
      style={{ aspectRatio: `${image.width} / ${image.height}` }}
    >
      {url ? (
        <img
          src={url}
          alt={decorative ? '' : image.alt}
          lang={decorative ? undefined : lang}
          width={image.width}
          height={image.height}
          decoding="async"
        />
      ) : null}
    </div>
  );
}
