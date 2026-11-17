import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { RecapAnswerView } from '../api/generated/models/RecapAnswerView';
import type { RecapSourceView } from '../api/generated/models/RecapSourceView';
import type { RecapView } from '../api/generated/models/RecapView';
import {
  FILM_LONG_WORDS,
  type FilmMedia,
  type FilmScene,
  filmSourceTitle,
} from '../client/recapFilm';
import type { ReferenceApis } from '../client/referenceFlow';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import { loadVideoSource } from '../client/video';
import { resolvedLocale, useTranslation } from '../i18n';
import { contextTagLabel } from './ContextTagList';
import { EimirIcon } from './EimirIcon';
import { MemoryPreview } from './MemoryPreview';
import './RecapFilmScene.css';

type MediaProps = {
  mediaApis: ReferenceApis;
  spaceId: string;
  account: { id: string };
};

type ParentType = 'MEMORY' | 'HEART_MOMENT' | 'PLAN';

function parentTypeOf(source: RecapSourceView | null): ParentType | null {
  return source?.kind === 'MEMORY' ||
    source?.kind === 'HEART_MOMENT' ||
    source?.kind === 'PLAN'
    ? source.kind
    : null;
}

function dayLabel(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(value);
}

function monthName(
  year: number,
  month: number,
  locale: string,
  width: 'long' | 'short' = 'long',
): string {
  return new Intl.DateTimeFormat(locale, {
    month: width,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** The edition's period name: the month of a monthly film, the year of a year film. */
function periodLabel(value: RecapView, locale: string): string {
  return value.kind === 'YEAR'
    ? new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(value.year, 0, 1)))
    : monthName(value.year, value.month ?? 1, locale);
}

/** One authorized picture of a film scene. */
function FilmImage({
  source,
  media,
  quality,
  onSettled,
  mediaApis,
  spaceId,
  account,
}: MediaProps & {
  source: RecapSourceView | null;
  media: FilmMedia;
  quality: 'original' | 'thumbnail';
  onSettled?: () => void;
}) {
  const parentType = parentTypeOf(source);
  const load = useCallback(
    (parentId: string, attachmentId: string, signal?: AbortSignal) => {
      if (!parentType)
        return Promise.reject(new Error('No authorized media parent.'));
      return loadAuthorizedStoryImageResource(
        mediaApis,
        spaceId,
        parentType,
        parentId,
        attachmentId,
        { signal, variant: quality },
      );
    },
    [mediaApis, spaceId, parentType, quality],
  );
  useEffect(() => {
    if (!parentType) onSettled?.();
  }, [parentType, onSettled]);
  if (!parentType) return null;
  return (
    <MemoryPreview
      memoryId={media.parentId}
      attachmentId={media.attachmentId}
      loadImage={load}
      isSensitive={false}
      loadingMode="immediate"
      onSettled={onSettled}
      resourceScopeKey={JSON.stringify([
        'recap-film',
        account.id,
        spaceId,
        media.attachmentId,
        quality,
      ])}
    />
  );
}

/** A short muted clip; the poster carries the scene while it loads or under reduced motion. */
function FilmClip({
  source,
  media,
  playing,
  reducedMotion,
  onSettled,
  ...props
}: MediaProps & {
  source: RecapSourceView | null;
  media: FilmMedia;
  playing: boolean;
  reducedMotion: boolean;
  onSettled?: () => void;
}) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const parentType = parentTypeOf(source);
  const start = media.clipStartSeconds ?? 0;
  const length = media.clipSeconds ?? 5;
  useEffect(() => {
    if (reducedMotion) return;
    if (parentType !== 'MEMORY' && parentType !== 'HEART_MOMENT') return;
    const controller = new AbortController();
    loadVideoSource(
      props.mediaApis,
      props.spaceId,
      parentType,
      media.parentId,
      media.attachmentId,
      controller.signal,
    )
      .then((result) => setUrl(result.url))
      // The poster stays when a clip cannot be played.
      .catch(() => undefined);
    return () => controller.abort();
  }, [
    reducedMotion,
    parentType,
    props.mediaApis,
    props.spaceId,
    media.parentId,
    media.attachmentId,
  ]);
  useEffect(() => {
    const element = video.current;
    if (!element || !url) return;
    const stop = () => {
      if (element.currentTime >= start + length) element.pause();
    };
    const begin = () => {
      if (element.currentTime < start || element.currentTime > start + length)
        element.currentTime = start;
    };
    element.addEventListener('timeupdate', stop);
    element.addEventListener('loadedmetadata', begin);
    if (element.readyState >= 1) begin();
    if (playing && !reducedMotion && element.currentTime < start + length)
      void element.play().catch(() => undefined);
    else element.pause();
    return () => {
      element.removeEventListener('timeupdate', stop);
      element.removeEventListener('loadedmetadata', begin);
    };
  }, [url, playing, reducedMotion, start, length]);
  return (
    <>
      <FilmImage
        {...props}
        source={source}
        media={media}
        quality="thumbnail"
        onSettled={onSettled}
      />
      {url ? (
        <video
          ref={video}
          className="recap-film-clip"
          src={url}
          muted
          playsInline
          preload="metadata"
          aria-label={t('recaps.film.video')}
        />
      ) : null}
    </>
  );
}

function Picture(
  props: MediaProps & {
    source: RecapSourceView | null;
    media: FilmMedia;
    playing: boolean;
    reducedMotion: boolean;
    quality?: 'original' | 'thumbnail';
    onSettled?: () => void;
    index?: number;
    className?: string;
  },
) {
  const { quality = 'original', index = 0, className, ...rest } = props;
  return (
    <div
      className={`recap-film-picture${className ? ` ${className}` : ''}`}
      data-kind={props.media.kind}
      style={{ '--film-i': index } as CSSProperties}
    >
      {props.media.kind === 'VIDEO' ? (
        <FilmClip {...rest} />
      ) : (
        <FilmImage
          {...rest}
          quality={quality}
          source={props.source}
          media={props.media}
          onSettled={props.onSettled}
        />
      )}
    </div>
  );
}

function Answers({
  answers,
  inline,
}: {
  answers: RecapAnswerView[];
  inline?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <ul className={`recap-film-answers${inline ? ' recap-film-inline' : ''}`}>
      {answers.map((answer, index) => (
        <li
          key={`${answer.authorId}:${answer.text}`}
          style={{ '--film-i': index } as CSSProperties}
        >
          <p className="recap-film-answer">
            {t('recaps.film.answer', { text: answer.text })}
          </p>
          {answer.authorName ? (
            <span className="recap-film-author">
              {answer.authorName.split(' ')[0]}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Eyebrow({ source }: { source: RecapSourceView }) {
  const locale = resolvedLocale();
  const parts = [
    source.occurredOn ? dayLabel(source.occurredOn, locale) : null,
    source.placeName ?? null,
  ].filter(Boolean);
  return parts.length ? (
    <p className="recap-film-eyebrow">{parts.join(' · ')}</p>
  ) : null;
}

/** Spread start points around the stage so the tags fly together from its edges. */
function tagOrigin(index: number): CSSProperties {
  const angle = (index * 137.5 * Math.PI) / 180;
  return {
    '--film-i': index,
    '--film-x': `${Math.round(Math.cos(angle) * 180)}%`,
    '--film-y': `${Math.round(Math.sin(angle) * 420)}%`,
  } as CSSProperties;
}

export type RecapFilmSceneProps = MediaProps & {
  scene: FilmScene;
  value: RecapView;
  playing: boolean;
  reducedMotion: boolean;
  onSettled: () => void;
  /** The canonical source link with the reader's return context. */
  sourceLink: (source: RecapSourceView) => ReactNode;
  /** Reflections and own-words actions of the closing scene. */
  closing?: ReactNode;
};

export function RecapFilmScene({
  scene,
  value,
  playing,
  reducedMotion,
  onSettled,
  sourceLink,
  closing,
  ...media
}: RecapFilmSceneProps) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const yearly = value.kind === 'YEAR';
  const month = periodLabel(value, locale);
  const pictureProps = { ...media, playing, reducedMotion };
  // Text-only scenes have nothing to load; their time starts at once.
  const hasMedia =
    (scene.type === 'cover' ||
      scene.type === 'duo' ||
      scene.type === 'closing') &&
    scene.media.length > 0
      ? true
      : scene.type === 'photo' ||
        (scene.type === 'covers' && scene.covers.length > 0);
  useEffect(() => {
    if (!hasMedia) onSettled();
  }, [hasMedia, onSettled]);

  switch (scene.type) {
    case 'cover': {
      const title =
        scene.title ??
        (yearly
          ? t('recaps.film.coverFallbackYear', { year: month })
          : t('recaps.film.coverFallback', { month }));
      const layout = scene.media.length ? scene.layout : 'type';
      const shown =
        layout === 'mosaic'
          ? scene.media.slice(0, 3)
          : layout === 'strip'
            ? scene.media
            : layout === 'single'
              ? scene.media.slice(0, 1)
              : [];
      return (
        <div className="recap-film-frame" data-layout={layout}>
          {shown.length ? (
            <div className="recap-film-media" data-count={shown.length}>
              {shown.map((item, index) => (
                <Picture
                  key={item.attachmentId}
                  {...pictureProps}
                  source={
                    value.sources.find(
                      (source) =>
                        source.id === item.parentId ||
                        (source.media ?? []).some(
                          (entry) => entry.attachmentId === item.attachmentId,
                        ),
                    ) ?? scene.source
                  }
                  media={item}
                  index={index}
                  quality={index === 0 ? 'original' : 'thumbnail'}
                  onSettled={index === 0 ? onSettled : undefined}
                />
              ))}
            </div>
          ) : null}
          <div className="recap-film-caption">
            <p className="recap-film-eyebrow">
              {yearly
                ? month
                : new Intl.DateTimeFormat(locale, {
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  }).format(
                    new Date(Date.UTC(value.year, (value.month ?? 1) - 1, 1)),
                  )}
            </p>
            <h1 className="recap-film-title">{title}</h1>
          </div>
        </div>
      );
    }
    case 'place':
      return (
        <div className="recap-film-frame" data-layout={scene.layout}>
          <ul
            className="recap-film-places"
            aria-label={t(
              yearly ? 'recaps.film.placesYear' : 'recaps.film.places',
            )}
          >
            {scene.places.map((place, index) => (
              <li key={place} style={{ '--film-i': index } as CSSProperties}>
                {scene.layout === 'marker' && index === 0 ? (
                  <EimirIcon name="orte" />
                ) : null}
                <span>{place}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'fact':
      return (
        <div className="recap-film-frame" data-layout={scene.layout}>
          <p className="recap-film-fact">
            <strong>{new Intl.NumberFormat(locale).format(scene.days)}</strong>
            <span>{t('recaps.film.days', { count: scene.days })}</span>
          </p>
        </div>
      );
    case 'photo': {
      const title = filmSourceTitle(scene.source);
      const long = (scene.words?.length ?? 0) >= FILM_LONG_WORDS;
      return (
        <div className="recap-film-frame" data-layout={scene.layout}>
          <div className="recap-film-media" data-count={1}>
            <Picture
              {...pictureProps}
              source={scene.source}
              media={scene.media}
              onSettled={onSettled}
            />
          </div>
          <div className="recap-film-caption">
            <Eyebrow source={scene.source} />
            {title ? <h1 className="recap-film-title">{title}</h1> : null}
            {scene.words ? (
              <p
                className={
                  long
                    ? 'recap-film-prose'
                    : 'recap-film-words recap-film-quoted'
                }
              >
                {scene.words}
              </p>
            ) : null}
            {scene.answers.length ? (
              <Answers answers={scene.answers} inline />
            ) : null}
            {sourceLink(scene.source)}
          </div>
        </div>
      );
    }
    case 'duo': {
      const title = filmSourceTitle(scene.source);
      return (
        <div className="recap-film-frame" data-layout={scene.layout}>
          <div className="recap-film-media" data-count={scene.media.length}>
            {scene.media.slice(0, 2).map((item, index) => (
              <Picture
                key={item.attachmentId}
                {...pictureProps}
                source={scene.source}
                media={item}
                index={index}
                onSettled={index === 0 ? onSettled : undefined}
              />
            ))}
          </div>
          <div className="recap-film-caption">
            <Eyebrow source={scene.source} />
            {title ? <h1 className="recap-film-title">{title}</h1> : null}
            {scene.answers.length ? (
              <Answers answers={scene.answers} inline />
            ) : null}
            {sourceLink(scene.source)}
          </div>
        </div>
      );
    }
    case 'words': {
      const long = scene.words.length >= FILM_LONG_WORDS;
      return (
        <div className="recap-film-frame" data-layout={scene.layout}>
          <div className="recap-film-caption">
            <Eyebrow source={scene.source} />
            {scene.layout === 'lines' && !long ? (
              scene.words.split(/(?<=[.!?…])\s+/u).map((line, index) => (
                <p
                  key={line}
                  className="recap-film-words"
                  style={{ '--film-i': index } as CSSProperties}
                >
                  {line}
                </p>
              ))
            ) : (
              <p
                className={
                  long
                    ? 'recap-film-prose'
                    : 'recap-film-words recap-film-quoted'
                }
              >
                {scene.words}
              </p>
            )}
            {sourceLink(scene.source)}
          </div>
        </div>
      );
    }
    case 'title': {
      const source = scene.source;
      const title = source.available
        ? (filmSourceTitle(source) ?? t('recaps.untitled'))
        : t('recaps.sourceUnavailable');
      return (
        <div className="recap-film-frame" data-layout={scene.layout}>
          <div className="recap-film-caption">
            {scene.layout === 'outline' && source.occurredOn ? (
              <p className="recap-film-day" aria-hidden="true">
                {new Intl.DateTimeFormat(locale, {
                  day: 'numeric',
                  timeZone: 'UTC',
                }).format(source.occurredOn)}
              </p>
            ) : null}
            <Eyebrow source={source} />
            <h1 className="recap-film-title">{title}</h1>
            {source.available ? sourceLink(source) : null}
          </div>
        </div>
      );
    }
    case 'answers':
      return (
        <div className="recap-film-frame" data-layout={scene.layout}>
          <div className="recap-film-caption">
            <Eyebrow source={scene.source} />
            {filmSourceTitle(scene.source) ? (
              <p className="recap-film-question">
                {filmSourceTitle(scene.source)}
              </p>
            ) : null}
            <Answers answers={scene.answers} />
            {sourceLink(scene.source)}
          </div>
        </div>
      );
    case 'tags': {
      const strongest = Math.max(...scene.tags.map((tag) => tag.count));
      return (
        <div className="recap-film-frame">
          <div className="recap-film-caption">
            <p className="recap-film-eyebrow">
              {yearly
                ? t('recaps.film.tagsYear', { year: month })
                : t('recaps.film.tags', { month })}
            </p>
            <ul className="recap-film-tags">
              {scene.tags.map((tag, index) => (
                <li
                  key={tag.label}
                  style={
                    {
                      ...tagOrigin(index),
                      '--film-weight': tag.count / strongest,
                    } as CSSProperties
                  }
                >
                  {contextTagLabel(tag.label, t)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    }
    case 'month':
      // A chapter marker: only the localized month name, no invented text.
      return (
        <div className="recap-film-frame" data-layout="month">
          <div className="recap-film-caption">
            <p className="recap-film-eyebrow">{month}</p>
            <h1 className="recap-film-month">
              {monthName(value.year, scene.month, locale)}
            </h1>
          </div>
        </div>
      );
    case 'firsts':
      return (
        <div className="recap-film-frame" data-layout="firsts">
          <div className="recap-film-caption">
            <p className="recap-film-eyebrow">{t('recaps.film.firsts')}</p>
            <ol className="recap-film-firsts">
              {scene.sources.map((source, index) => (
                <li
                  key={source.key}
                  style={{ '--film-i': index } as CSSProperties}
                >
                  <span className="recap-film-firsts-when">
                    {source.occurredOn
                      ? dayLabel(source.occurredOn, locale)
                      : ''}
                  </span>
                  <span className="recap-film-firsts-title">
                    {filmSourceTitle(source) ?? t('recaps.untitled')}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      );
    case 'covers':
      return (
        <div className="recap-film-frame" data-layout="covers">
          <ol
            className="recap-film-media recap-film-covers"
            data-count={scene.covers.length}
            aria-label={t('recaps.film.covers', { year: month })}
          >
            {scene.covers.map((cover, index) => (
              <li
                key={cover.month}
                className="recap-film-cover-tile"
                style={{ '--film-i': index } as CSSProperties}
              >
                <Picture
                  {...pictureProps}
                  source={cover.source}
                  media={cover.media}
                  index={index}
                  quality="thumbnail"
                  onSettled={index === 0 ? onSettled : undefined}
                />
                <span className="recap-film-cover-month">
                  {monthName(value.year, cover.month, locale, 'short')}
                </span>
              </li>
            ))}
          </ol>
          <div className="recap-film-caption">
            <p className="recap-film-eyebrow">
              {t('recaps.film.covers', { year: month })}
            </p>
          </div>
        </div>
      );
    case 'closing':
      return (
        <div className="recap-film-frame" data-layout="closing">
          {scene.media.length ? (
            <div className="recap-film-media" data-count={scene.media.length}>
              {scene.media.map((item, index) => (
                <Picture
                  key={item.attachmentId}
                  {...pictureProps}
                  source={
                    value.sources.find(
                      (source) =>
                        source.id === item.parentId ||
                        (source.media ?? []).some(
                          (entry) => entry.attachmentId === item.attachmentId,
                        ),
                    ) ?? null
                  }
                  media={item}
                  index={index}
                  quality="thumbnail"
                  onSettled={index === 0 ? onSettled : undefined}
                />
              ))}
            </div>
          ) : null}
          <div className="recap-film-caption">
            <p className="recap-film-words">
              {t('recaps.film.closing', { month, count: scene.days })}
            </p>
            {closing}
          </div>
        </div>
      );
    default:
      return null;
  }
}
