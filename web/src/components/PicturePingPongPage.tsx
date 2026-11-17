import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { GamesApi } from '../api/generated/apis/GamesApi';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { PictureColour } from '../api/generated/models/PictureColour';
import type { PicturePingPongState } from '../api/generated/models/PicturePingPongState';
import type { PicturePingPongView } from '../api/generated/models/PicturePingPongView';
import { Configuration } from '../client/apiConfiguration';
import {
  createMemoryWithReadyAttachments,
  uploadMemoryDraftAttachment,
} from '../client/memoryAttachmentDraft';
import { usePartnerDistanceLine } from '../client/partnerDistance';
import {
  createPartnerLocationApi,
  PARTNER_LOCATION_CAPABILITY,
  partnerLocationSettingsQueryKey,
} from '../client/partnerLocation';
import {
  appendPoint,
  type DrawnStroke,
  type FlightProfile,
  finishStroke,
  flightProfile,
  MAX_STROKES_PER_TURN,
  MAX_TURNS,
  type PictureInks,
  picturePingPongQueryKey,
  renderPictureBlob,
  STROKE_WIDTH,
  strokePath,
  titleSuggestionIndexes,
  toGridPoint,
} from '../client/picturePingPong';
import { normalizeClientError } from '../client/problemDetails';
import {
  createReferenceApis,
  type ReferenceApis,
} from '../client/referenceFlow';
import { appRoutePath, memoryDetailPath } from '../client/routes';
import {
  entitlementLoader,
  useSpaceCapability,
} from '../client/spaceEntitlement';
import { useMemberAvatarUrl } from '../client/useMemberAvatarUrl';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { useDistanceShortText } from './PartnerDistanceLine';
import { PersonIdentity } from './PersonIdentity';
import { ProblemState } from './ProblemState';
import { TaskBackLink } from './TaskBackButton';
import { UiState } from './UiState';
import './PicturePingPongPage.css';

const FLIGHT_BASE_MS = 900;
const COLOURS = [
  'PERSON',
  'INK',
  'SUN',
] as const satisfies readonly PictureColour[];
const TITLE_KEYS = [
  'games.pingPong.titles.one',
  'games.pingPong.titles.two',
  'games.pingPong.titles.three',
  'games.pingPong.titles.four',
  'games.pingPong.titles.five',
  'games.pingPong.titles.six',
] as const;

export interface PicturePingPongServices {
  load: () => Promise<PicturePingPongState>;
  start: () => Promise<PicturePingPongState>;
  handOver: (
    turnsDone: number,
    strokes: DrawnStroke[],
  ) => Promise<PicturePingPongState>;
  finish: (turnsDone: number) => Promise<PicturePingPongState>;
  markSaved: (memoryId: string) => Promise<PicturePingPongState>;
  saveToMoments: (input: {
    title: string;
    body: string;
    image: Blob;
  }) => Promise<{ memoryId: string }>;
}

function localDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function useDefaultServices({
  apiBaseUrl,
  accessToken,
  spaceId,
  accountId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  accountId: string;
}): PicturePingPongServices {
  return useMemo(() => {
    const api = new GamesApi(
      new Configuration({
        basePath: apiBaseUrl,
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    const apis: ReferenceApis = createReferenceApis(apiBaseUrl, accessToken);
    return {
      load: () => api.getPicturePingPong({ spaceId }),
      start: () => api.startPicturePingPong({ spaceId }),
      handOver: (turnsDone, strokes) =>
        api.handOverPicturePingPongTurn({
          spaceId,
          pictureTurnInput: {
            turnsDone,
            strokes: strokes.map((stroke) => ({
              colour: stroke.colour,
              points: stroke.points,
            })),
          },
        }),
      finish: (turnsDone) =>
        api.finishPicturePingPong({
          spaceId,
          pictureFinishInput: { turnsDone },
        }),
      markSaved: (memoryId) =>
        api.markPicturePingPongSaved({
          spaceId,
          pictureSavedInput: { memoryId },
        }),
      saveToMoments: async ({ title, body, image }) => {
        const file = new File([image], 'bild-pingpong.png', {
          type: 'image/png',
        });
        const ready = await uploadMemoryDraftAttachment(
          apis,
          apiBaseUrl,
          accessToken,
          spaceId,
          file,
          undefined,
          fetch,
          { accountId },
        );
        const { memory } = await createMemoryWithReadyAttachments(
          apis,
          spaceId,
          { title, body, happenedOn: localDay() },
          [ready.attachmentId],
        );
        return { memoryId: memory.id };
      },
    };
  }, [accessToken, accountId, apiBaseUrl, spaceId]);
}

/** The distance flight reads the existing server band and stores nothing. */
function useFlightProfile({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  enabled,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  enabled: boolean;
}): FlightProfile {
  const locationApi = useMemo(
    () => createPartnerLocationApi(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
  const entitlementApi = useMemo(
    () =>
      new EntitlementsApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [apiBaseUrl, accessToken],
  );
  const load = useMemo(
    () => entitlementLoader(entitlementApi, spaceId),
    [entitlementApi, spaceId],
  );
  const capability = useSpaceCapability({
    accountId,
    spaceId,
    load,
    capability: PARTNER_LOCATION_CAPABILITY,
  });
  const settings = useQuery({
    queryKey: partnerLocationSettingsQueryKey(accountId, spaceId),
    enabled: false,
  }).data as { available?: boolean } | undefined;
  const allowed =
    enabled && capability.data === true && settings?.available === true;
  const line = usePartnerDistanceLine({
    api: locationApi,
    accountId,
    spaceId,
    enabled: allowed,
  });
  return flightProfile(allowed && !line.isError ? line.data : undefined);
}

function cssValue(element: Element, name: string, fallback: string): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return value || fallback;
}

function draftStorageKey(spaceId: string, accountId: string): string {
  return `eimir:picture-ping-pong:draft:${spaceId}:${accountId}`;
}

interface StoredDraft {
  pictureId: string;
  turnsDone: number;
  strokes: DrawnStroke[];
}

function readDraft(key: string, picture: PicturePingPongView): DrawnStroke[] {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    const stored = JSON.parse(raw) as StoredDraft;
    if (
      stored.pictureId === picture.id &&
      stored.turnsDone === picture.turnsDone &&
      Array.isArray(stored.strokes)
    ) {
      return stored.strokes.slice(0, MAX_STROKES_PER_TURN);
    }
  } catch {
    // Storage may be unavailable; the draft then simply starts empty.
  }
  return [];
}

function writeDraft(
  key: string,
  picture: PicturePingPongView,
  strokes: DrawnStroke[],
): void {
  try {
    if (strokes.length === 0) {
      window.sessionStorage.removeItem(key);
      return;
    }
    const stored: StoredDraft = {
      pictureId: picture.id,
      turnsDone: picture.turnsDone,
      strokes,
    };
    window.sessionStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Not persisting a draft is acceptable; the picture itself is unaffected.
  }
}

function strokeClass(
  stroke: { colour: PictureColour; authorId?: string | null },
  me: string,
): string {
  if (stroke.colour === 'INK') return 'is-ink';
  if (stroke.colour === 'SUN') return 'is-sun';
  return stroke.authorId === me ? 'is-own' : 'is-partner';
}

function TurnDots({
  picture,
  me,
  partnerId,
  names,
}: {
  picture: PicturePingPongView;
  me: string;
  partnerId: string | null;
  names: { own: string; partner: string };
}) {
  const { t } = useTranslation();
  const starter = picture.startedBy;
  const other = starter === me ? partnerId : me;
  return (
    <ol className="pingpong-dots" aria-label={t('games.pingPong.turnsLabel')}>
      {Array.from({ length: MAX_TURNS }, (_, index) => {
        const turn = index + 1;
        const author = turn % 2 === 1 ? starter : other;
        const role = author === me ? 'own' : 'partner';
        const done = turn <= picture.turnsDone;
        const current =
          picture.status === 'DRAWING' && turn === picture.turnsDone + 1;
        const state = done
          ? t('games.pingPong.turnDone')
          : current
            ? t('games.pingPong.turnCurrent')
            : t('games.pingPong.turnOpen');
        return (
          <li
            key={turn}
            className={`pingpong-dot person-role-${role}${done ? ' is-done' : ''}${current ? ' is-current' : ''}`}
            aria-current={current ? 'step' : undefined}
            aria-label={t('games.pingPong.turnDot', {
              turn,
              total: MAX_TURNS,
              name: role === 'own' ? names.own : names.partner,
              state,
            })}
          />
        );
      })}
    </ol>
  );
}

function Stage({
  names,
  avatars,
  flight,
  profile,
  distanceLabel,
  sentLabel,
}: {
  names: { own: string; partner: string };
  avatars: { own: string | null; partner: string | null };
  flight: 'toPartner' | 'toMe' | null;
  profile: FlightProfile;
  distanceLabel: string | null;
  sentLabel: string | null;
}) {
  const style = {
    '--pingpong-flight-scale': String(profile.durationScale),
    '--pingpong-arc': String(profile.arcHeight),
  } as React.CSSProperties;
  return (
    <div className="pingpong-stage" style={style}>
      <span className="pingpong-avatar person-role-own">
        <PersonIdentity
          displayName={names.own}
          imageUrl={avatars.own}
          size="medium"
          showName={false}
          imageAlt={names.own}
          fallbackAlt={names.own}
        />
      </span>
      <div className="pingpong-track" aria-hidden="true">
        <span className="pingpong-arc-line" />
        {flight ? (
          <span
            className={`pingpong-flyer ${flight === 'toMe' ? 'is-to-me' : 'is-to-partner'}`}
            data-testid="pingpong-flyer"
          >
            <span className="pingpong-flyer-chip" />
          </span>
        ) : null}
        {sentLabel && distanceLabel ? (
          <span className="pingpong-distance">{distanceLabel}</span>
        ) : null}
      </div>
      <span className="pingpong-avatar person-role-partner">
        <PersonIdentity
          displayName={names.partner}
          imageUrl={avatars.partner}
          size="medium"
          showName={false}
          imageAlt={names.partner}
          fallbackAlt={names.partner}
        />
      </span>
    </div>
  );
}

export function PicturePingPongPage({
  apiBaseUrl,
  accessToken,
  spaceId,
  currentAccountId,
  services,
  loadPartners,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  currentAccountId: string;
  services?: PicturePingPongServices;
  loadPartners?: () => Promise<
    ReadonlyArray<{ id: string; displayName: string }>
  >;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const defaults = useDefaultServices({
    apiBaseUrl,
    accessToken,
    spaceId,
    accountId: currentAccountId,
  });
  const api = services ?? defaults;
  const queryKey = picturePingPongQueryKey(currentAccountId, spaceId);

  const pictureQuery = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await api.load();
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    // A waiting picture needs no timer, only a gentle look when the partner
    // may have handed it over; this reads the same single resource.
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const picture = query.state.data?.picture;
      return picture?.status === 'DRAWING' &&
        picture.drawerId !== currentAccountId
        ? 20_000
        : false;
    },
    refetchIntervalInBackground: false,
  });

  const spaceQuery = useQuery({
    queryKey: ['games', 'picture-ping-pong', 'partners', spaceId],
    queryFn: async () => {
      if (loadPartners) return loadPartners();
      const spaces = new SpacesApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      return (await spaces.getSpaceApiV1SpacesSpaceIdGet({ spaceId })).partners;
    },
    retry: false,
  });
  const partners = spaceQuery.data;
  const partner = partners?.find((entry) => entry.id !== currentAccountId);
  const ownName =
    partners?.find((entry) => entry.id === currentAccountId)?.displayName ??
    t('games.pingPong.you');
  const partnerName =
    partner?.displayName ?? t('games.pingPong.partnerFallback');
  const names = { own: ownName, partner: partnerName };
  const partnerId = partner?.id ?? null;
  const avatars = {
    own: useMemberAvatarUrl({
      apiBaseUrl,
      accessToken,
      spaceId,
      accountId: currentAccountId,
      enabled: !services,
    }),
    partner: useMemberAvatarUrl({
      apiBaseUrl,
      accessToken,
      spaceId,
      accountId: partnerId,
      enabled: !services,
    }),
  };

  const picture = pictureQuery.data?.picture ?? null;
  const myTurn =
    picture?.status === 'DRAWING' && picture.drawerId === currentAccountId;

  const profile = useFlightProfile({
    apiBaseUrl,
    accessToken,
    accountId: currentAccountId,
    spaceId,
    enabled: !services,
  });
  const shortDistance = useDistanceShortText();
  const distanceLabel =
    profile.label && profile.label.kind === 'distance'
      ? shortDistance(profile.label.band)
      : null;

  const draftKey = draftStorageKey(spaceId, currentAccountId);
  const [draft, setDraft] = useState<DrawnStroke[]>([]);
  const [active, setActive] = useState<number[]>([]);
  const [colour, setColour] = useState<PictureColour>('PERSON');
  const [flight, setFlight] = useState<'toPartner' | 'toMe' | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [titleIndex, setTitleIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const flightTimer = useRef<number | null>(null);
  const previous = useRef<{ id: string; turnsDone: number } | null>(null);

  const pictureId = picture?.id ?? null;
  const pictureTurns = picture?.turnsDone ?? null;
  // Restore a local draft for exactly this picture and turn.
  // biome-ignore lint/correctness/useExhaustiveDependencies: restore only when the picture id or turn changes, never on every refetch
  useEffect(() => {
    if (!picture) {
      setDraft([]);
      return;
    }
    setDraft(myTurn ? readDraft(draftKey, picture) : []);
    setActive([]);
    setConfirmFinish(false);
  }, [pictureId, pictureTurns, myTurn, draftKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: persist when the local draft changes
  useEffect(() => {
    if (picture && myTurn) writeDraft(draftKey, picture, draft);
  }, [draft]);

  const playFlight = useCallback((direction: 'toPartner' | 'toMe') => {
    if (flightTimer.current !== null) window.clearTimeout(flightTimer.current);
    setFlight(direction);
    flightTimer.current = window.setTimeout(() => {
      setFlight(null);
      flightTimer.current = null;
    }, FLIGHT_BASE_MS * 2);
  }, []);

  useEffect(
    () => () => {
      if (flightTimer.current !== null)
        window.clearTimeout(flightTimer.current);
    },
    [],
  );

  // A turn that arrives while the page is open flies in from the partner.
  useEffect(() => {
    if (!picture) {
      previous.current = null;
      return;
    }
    const before = previous.current;
    if (
      before &&
      before.id === picture.id &&
      picture.turnsDone > before.turnsDone &&
      picture.drawerId === currentAccountId
    ) {
      playFlight('toMe');
      setSent(false);
    }
    previous.current = { id: picture.id, turnsDone: picture.turnsDone };
  }, [currentAccountId, picture, playFlight]);

  const apply = useCallback(
    (state: PicturePingPongState) => {
      queryClient.setQueryData(queryKey, state);
    },
    [queryClient, queryKey],
  );

  const run = useCallback(
    async (action: () => Promise<PicturePingPongState>) => {
      setBusy(true);
      setProblem(null);
      setNotice(null);
      try {
        const state = await action();
        apply(state);
        return state;
      } catch (error) {
        const normalized = await normalizeClientError(error);
        if ((normalized as { status?: number }).status === 409) {
          setNotice(t('games.pingPong.changedMeanwhile'));
          await queryClient.invalidateQueries({ queryKey });
        } else {
          setProblem(normalized);
        }
        return null;
      } finally {
        setBusy(false);
      }
    },
    [apply, queryClient, queryKey, t],
  );

  const canDraw =
    myTurn && !busy && draft.length < MAX_STROKES_PER_TURN && Boolean(picture);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!canDraw || !svgRef.current) return;
    event.preventDefault();
    svgRef.current.setPointerCapture?.(event.pointerId);
    const [x, y] = toGridPoint(
      event.clientX,
      event.clientY,
      svgRef.current.getBoundingClientRect(),
    );
    setActive([x, y]);
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (active.length === 0 || !svgRef.current) return;
    const [x, y] = toGridPoint(
      event.clientX,
      event.clientY,
      svgRef.current.getBoundingClientRect(),
    );
    setActive((points) => appendPoint(points, x, y));
  };
  const onPointerEnd = () => {
    if (active.length === 0) return;
    const points = finishStroke(active);
    setActive([]);
    if (points && draft.length < MAX_STROKES_PER_TURN) {
      setDraft((strokes) => [...strokes, { colour, points }]);
    }
  };

  const send = async () => {
    if (!picture || draft.length === 0) return;
    const sentStrokes = draft;
    const state = await run(() => api.handOver(picture.turnsDone, sentStrokes));
    if (state) {
      setDraft([]);
      writeDraft(draftKey, picture, []);
      setSent(true);
      playFlight('toPartner');
    }
  };

  const inks = (): PictureInks => {
    const element = svgRef.current ?? document.documentElement;
    return {
      paper: cssValue(element, '--color-surface-raised', '#ffffff'),
      ink: cssValue(element, '--color-text', '#1d2433'),
      sun: cssValue(element, '--photo-mark-yellow', '#f6c445'),
      person: (authorId) =>
        authorId === currentAccountId
          ? cssValue(element, '--person-own-accent', '#5685d1')
          : cssValue(element, '--person-partner-accent', '#aa4c86'),
    };
  };

  const save = async () => {
    if (!picture) return;
    setSaving(true);
    setProblem(null);
    try {
      const strokes = picture.strokes.map((stroke) => ({
        colour: stroke.colour,
        authorId: stroke.authorId,
        points: stroke.points,
      }));
      const image = await renderPictureBlob(strokes, inks());
      const suggestions = titleSuggestionIndexes(picture.id);
      const title = t(TITLE_KEYS[suggestions[titleIndex] ?? 0]);
      const { memoryId } = await api.saveToMoments({
        title,
        body: t('games.pingPong.memoryBody', { name: partnerName }),
        image,
      });
      apply(await api.markSaved(memoryId));
    } catch (error) {
      setProblem(await normalizeClientError(error));
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <PageHeader
      eyebrow={t('games.entries.pingPong.role')}
      title={t('games.entries.pingPong.title')}
      description={t('games.pingPong.intro')}
      className="pingpong-heading"
    />
  );

  if (pictureQuery.isPending) {
    return (
      <div className="page pingpong-page">
        {header}
        <UiState
          kind="loading"
          title={t('games.pingPong.loadingTitle')}
          body={t('games.pingPong.loadingBody')}
        />
      </div>
    );
  }
  if (pictureQuery.error) {
    return (
      <div className="page pingpong-page">
        {header}
        <ProblemState
          error={pictureQuery.error}
          onRetry={() => void pictureQuery.refetch()}
        />
      </div>
    );
  }

  if (!picture) {
    return (
      <div className="page pingpong-page">
        {header}
        {problem ? <ProblemState error={problem as Error} /> : null}
        <section
          className="pingpong-empty eimir-motion-disclosure"
          aria-labelledby="pingpong-empty-title"
        >
          <Stage
            names={names}
            avatars={avatars}
            flight={null}
            profile={profile}
            distanceLabel={null}
            sentLabel={null}
          />
          <p className="eyebrow">{t('games.pingPong.emptyEyebrow')}</p>
          <h2 id="pingpong-empty-title">{t('games.pingPong.emptyTitle')}</h2>
          <p>{t('games.pingPong.emptyBody')}</p>
          <button
            type="button"
            className="pingpong-primary"
            disabled={busy}
            onClick={() => void run(() => api.start())}
          >
            {t('games.pingPong.newPicture')}
          </button>
        </section>
      </div>
    );
  }

  const finished = picture.status === 'FINISHED';
  const suggestions = titleSuggestionIndexes(picture.id);
  const inkUsed = (stroke: {
    colour: PictureColour;
    authorId?: string | null;
  }) => strokeClass(stroke, currentAccountId);

  return (
    <div className="page pingpong-page">
      {header}
      <section
        className="pingpong-card"
        aria-labelledby="pingpong-status"
        data-status={picture.status}
      >
        <div className="pingpong-status-row">
          <h2
            id="pingpong-status"
            className="pingpong-status"
            aria-live="polite"
          >
            {finished
              ? t('games.pingPong.doneTitle')
              : myTurn
                ? t('games.pingPong.turnYou')
                : t('games.pingPong.turnPartner', { name: partnerName })}
          </h2>
          {myTurn ? (
            <p className="pingpong-strokes-used">
              {t('games.pingPong.strokesUsed', {
                count: draft.length,
                max: MAX_STROKES_PER_TURN,
              })}
            </p>
          ) : null}
        </div>

        <Stage
          names={names}
          avatars={avatars}
          flight={flight}
          profile={profile}
          distanceLabel={distanceLabel}
          sentLabel={sent ? 'sent' : null}
        />

        <svg
          ref={svgRef}
          className={`pingpong-canvas${canDraw ? ' is-drawable' : ''}`}
          viewBox="0 0 1000 1000"
          role="img"
          aria-label={t('games.pingPong.canvasLabel')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <g
            fill="none"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {picture.strokes.map((stroke, index) => (
              <path
                // Strokes are append-only, so position is a stable identity.
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
                key={index}
                className={`pingpong-stroke ${inkUsed(stroke)}`}
                d={strokePath(stroke.points)}
              />
            ))}
            {draft.map((stroke, index) => (
              <path
                // biome-ignore lint/suspicious/noArrayIndexKey: local draft order
                key={`draft-${index}`}
                className={`pingpong-stroke is-draft ${inkUsed({ colour: stroke.colour, authorId: currentAccountId })}`}
                d={strokePath(stroke.points)}
              />
            ))}
            {active.length >= 2 ? (
              <path
                className={`pingpong-stroke is-draft ${inkUsed({ colour, authorId: currentAccountId })}`}
                d={strokePath(finishStroke(active) ?? active)}
              />
            ) : null}
          </g>
        </svg>

        <TurnDots
          picture={picture}
          me={currentAccountId}
          partnerId={partnerId}
          names={names}
        />

        {notice ? (
          <p className="pingpong-note" role="status">
            {notice}
          </p>
        ) : null}
        {problem ? <ProblemState error={problem as Error} /> : null}

        {finished ? (
          <div className="pingpong-finish">
            <p>{t('games.pingPong.doneBody')}</p>
            {picture.savedMemoryId ? (
              <p className="pingpong-saved" role="status">
                {t('games.pingPong.saved')}{' '}
                <Link to={memoryDetailPath(picture.savedMemoryId)}>
                  {t('games.pingPong.openMoment')}
                </Link>
              </p>
            ) : (
              <>
                <fieldset className="pingpong-titles">
                  <legend>{t('games.pingPong.titleLegend')}</legend>
                  {suggestions.map((value, index) => (
                    <label
                      key={value}
                      className={`pingpong-title-chip${titleIndex === index ? ' is-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="pingpong-title"
                        checked={titleIndex === index}
                        onChange={() => setTitleIndex(index)}
                      />
                      <span>{t(TITLE_KEYS[value])}</span>
                    </label>
                  ))}
                </fieldset>
                <button
                  type="button"
                  className="pingpong-primary"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving
                    ? t('games.pingPong.saving')
                    : t('games.pingPong.saveToMoments')}
                </button>
              </>
            )}
            <button
              type="button"
              className="pingpong-secondary"
              disabled={busy}
              onClick={() => void run(() => api.start())}
            >
              {t('games.pingPong.newPicture')}
            </button>
            <TaskBackLink to={appRoutePath('games')} inline>
              {t('games.pingPong.backToGames')}
            </TaskBackLink>
          </div>
        ) : myTurn ? (
          <div className="pingpong-tools">
            <fieldset className="pingpong-colours">
              <legend className="sr-only">
                {t('games.pingPong.colourLegend')}
              </legend>
              {COLOURS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`pingpong-colour is-${value.toLowerCase()}${colour === value ? ' is-selected' : ''}`}
                  aria-pressed={colour === value}
                  aria-label={t(
                    value === 'PERSON'
                      ? 'games.pingPong.colourOwn'
                      : value === 'INK'
                        ? 'games.pingPong.colourInk'
                        : 'games.pingPong.colourSun',
                  )}
                  onClick={() => setColour(value)}
                />
              ))}
            </fieldset>
            <button
              type="button"
              className="pingpong-secondary"
              disabled={draft.length === 0 || busy}
              onClick={() => setDraft((strokes) => strokes.slice(0, -1))}
            >
              {t('games.pingPong.undo')}
            </button>
            <button
              type="button"
              className="pingpong-primary"
              disabled={draft.length === 0 || busy}
              onClick={() => void send()}
            >
              {t('games.pingPong.send', { name: partnerName })}
            </button>
          </div>
        ) : sent ? (
          <p className="pingpong-wait" role="status">
            {t('games.pingPong.sentNote', { name: partnerName })}
          </p>
        ) : (
          <p className="pingpong-wait">
            {t('games.pingPong.waitingNote', { name: partnerName })}
          </p>
        )}

        {!finished && picture.turnsDone >= 1 ? (
          confirmFinish ? (
            <div className="pingpong-confirm">
              <p>{t('games.pingPong.finishConfirm')}</p>
              <button
                type="button"
                className="pingpong-secondary"
                disabled={busy}
                onClick={() => void run(() => api.finish(picture.turnsDone))}
              >
                {t('games.pingPong.finishConfirmAction')}
              </button>
              <button
                type="button"
                className="pingpong-quiet"
                onClick={() => setConfirmFinish(false)}
              >
                {t('games.pingPong.finishKeep')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="pingpong-quiet"
              onClick={() => setConfirmFinish(true)}
            >
              {t('games.pingPong.finishEarly')}
            </button>
          )
        ) : null}
      </section>
    </div>
  );
}
