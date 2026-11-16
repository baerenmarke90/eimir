/**
 * Bouquets in the shared garden (#1907 H3, PR 3): pick up to three blooming
 * flowers and give them to the partner; a seed stays in each place. The
 * partner gets a bouquet card and can put it into Momente on an explicit tap.
 */

import type { Ref } from 'react';
import type { GardenSpecies } from '../api/generated/models/GardenSpecies';
import { useTranslation } from '../i18n';
import { FlowerHead } from './GardenArt';

export interface BouquetFlower {
  species: GardenSpecies;
  colour: string;
}

/** A hand-tied bouquet: stems fanned out over a paper wrap and a ribbon. */
export function BouquetArt({
  flowers,
  size = 64,
  label,
  svgRef,
}: {
  flowers: ReadonlyArray<BouquetFlower>;
  size?: number;
  label?: string;
  svgRef?: Ref<SVGSVGElement>;
}) {
  const spread = (index: number) => (index - (flowers.length - 1) / 2) * 0.5;
  return (
    <svg
      ref={svgRef}
      className="garden-bouquet-art"
      width={size}
      height={size}
      viewBox="-30 -36 60 66"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {flowers.map((_flower, index) => {
        const a = spread(index);
        return (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: up to three fixed stems
            key={`stem-${index}`}
            d={`M0 10 Q${(Math.sin(a) * 6).toFixed(1)} 0 ${(Math.sin(a) * 18).toFixed(1)} ${(-Math.cos(a) * 18).toFixed(1)}`}
            stroke="var(--garden-stem)"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
        );
      })}
      <path
        d="M-9 3 C-6 2 6 2 9 3 C7 10 3 20 0 28 C-3 20 -7 10 -9 3Z"
        fill="var(--garden-house)"
      />
      <path
        d="M-4.6 11.6 C-2 10.6 2 10.6 4.6 11.6 C3 13.4 -3 13.4 -4.6 11.6Z"
        fill="var(--person-own-accent)"
      />
      {flowers.map((flower, index) => {
        const a = spread(index);
        return (
          <g
            // biome-ignore lint/suspicious/noArrayIndexKey: up to three fixed heads
            key={`head-${index}`}
            transform={`translate(${(Math.sin(a) * 20).toFixed(1)} ${(-Math.cos(a) * 20 - 4).toFixed(1)}) scale(.8)`}
          >
            <FlowerHead species={flower.species} colour={flower.colour} />
          </g>
        );
      })}
    </svg>
  );
}

/** While binding: which flowers are picked, cancel, give. */
export function BouquetBindCard({
  flowers,
  partnerName,
  busy,
  onCancel,
  onGive,
}: {
  flowers: ReadonlyArray<BouquetFlower>;
  partnerName: string;
  busy: boolean;
  onCancel: () => void;
  onGive: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="garden-card"
      aria-labelledby="garden-bind-title"
      data-testid="garden-bind-card"
    >
      <h2 id="garden-bind-title">{t('games.garden.growth.bindTitle')}</h2>
      <p>{t('games.garden.growth.bindBody')}</p>
      {flowers.length > 0 ? (
        <div className="garden-bouquet-preview">
          <BouquetArt flowers={flowers} size={56} />
          <p aria-live="polite">
            {t('games.garden.growth.bindCount', { count: flowers.length })}
          </p>
        </div>
      ) : null}
      <div className="garden-card-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          {t('games.garden.cancel')}
        </button>
        <button
          type="button"
          disabled={flowers.length === 0 || busy}
          onClick={onGive}
        >
          {t('games.garden.growth.bindSend', { name: partnerName })}
        </button>
      </div>
    </section>
  );
}

/** A bouquet that arrived from the partner. */
export function BouquetReceivedCard({
  flowers,
  partnerName,
  messengerName,
  busy,
  svgRef,
  onThanks,
  onKeep,
}: {
  flowers: ReadonlyArray<BouquetFlower>;
  partnerName: string;
  messengerName: string;
  busy: boolean;
  svgRef: Ref<SVGSVGElement>;
  onThanks: () => void;
  onKeep: () => void;
}) {
  const { t } = useTranslation();
  const names = flowers
    .map((flower) => t(`games.garden.species.${flower.species}.name`))
    .join(', ');
  return (
    <section
      className="garden-card garden-bouquet-card"
      aria-labelledby="garden-bouquet-title"
      aria-live="polite"
      data-testid="garden-bouquet-card"
    >
      <div className="garden-arrival">
        <BouquetArt
          flowers={flowers}
          size={72}
          svgRef={svgRef}
          label={t('games.garden.growth.bouquetLabel', { flowers: names })}
        />
        <div>
          <h2 id="garden-bouquet-title">
            {t('games.garden.growth.bouquetTitle', { name: partnerName })}
          </h2>
          <p>
            {t('games.garden.growth.bouquetBody', {
              messenger: messengerName,
            })}
          </p>
        </div>
      </div>
      <div className="garden-card-actions">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onThanks}
        >
          {t('games.garden.growth.bouquetThanks')}
        </button>
        <button type="button" disabled={busy} onClick={onKeep}>
          {t('games.garden.growth.bouquetKeep')}
        </button>
      </div>
    </section>
  );
}
