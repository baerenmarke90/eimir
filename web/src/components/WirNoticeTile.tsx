import type { Tile } from './WirNewForYouModule';
import './WirReelTiles.css';

/**
 * The body of a "Neu für dich" tile in the tiles style (#2345, from #2349): a
 * real content preview per kind. Pictures are decorative; the visible text
 * carries the title, the quote and the line.
 */
export function WirNoticeTileBody({ tile }: { tile: Tile }) {
  switch (tile.art) {
    case 'today':
      return (
        <span className="wir-ntile-body">
          {tile.time ? (
            <span className="wir-ntile-time">{tile.time}</span>
          ) : null}
          <span className="wir-ntile-title">{tile.title}</span>
        </span>
      );
    case 'date':
      return (
        <span className="wir-ntile-body">
          {tile.day ? (
            <span className="wir-ntile-leaf">
              <span className="wir-ntile-leaf-weekday">{tile.weekday}</span>
              <span className="wir-ntile-leaf-day">{tile.day}</span>
              {tile.time ? (
                <span className="wir-ntile-leaf-time">{tile.time}</span>
              ) : null}
            </span>
          ) : null}
          <span className="wir-ntile-title">{tile.title}</span>
        </span>
      );
    case 'list':
      return (
        <span className="wir-ntile-body">
          <span className="wir-ntile-title">{tile.title}</span>
          {tile.previewItems && tile.previewItems.length > 0 ? (
            <span className="wir-ntile-paper">
              {tile.previewItems.map((item) => (
                <span key={item} className="wir-ntile-check">
                  <span className="wir-ntile-box" aria-hidden="true" />
                  {item}
                </span>
              ))}
              {tile.previewMoreItems ? (
                <span className="wir-ntile-more">{tile.previewMoreItems}</span>
              ) : null}
            </span>
          ) : null}
        </span>
      );
    case 'note':
    case 'bubble':
      return (
        <span className="wir-ntile-body">
          {tile.art === 'note' ? (
            <span className="wir-ntile-title">{tile.title}</span>
          ) : null}
          {tile.quote ? (
            <span className="wir-ntile-bubble">{tile.quote}</span>
          ) : null}
        </span>
      );
    case 'reaction':
      return (
        <span className="wir-ntile-body">
          {tile.reaction ? (
            <span className="wir-ntile-reaction" aria-hidden="true">
              {tile.reaction}
            </span>
          ) : null}
          <span className="wir-ntile-title">{tile.title}</span>
        </span>
      );
    case 'heart':
      return (
        <span className="wir-ntile-body">
          <svg
            className="wir-ntile-heart"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M12 20.5s-8-4.9-8-10.6A4.5 4.5 0 0 1 12 7.3a4.5 4.5 0 0 1 8 2.6c0 5.7-8 10.6-8 10.6z" />
          </svg>
          <span className="wir-ntile-title">{tile.title}</span>
        </span>
      );
    case 'picture':
      return (
        <span className="wir-ntile-body">
          <span className="wir-ntile-canvas">
            <svg viewBox="0 0 104 64" aria-hidden="true" focusable="false">
              <path
                className="wir-ntile-stroke-cool"
                d="M12 46c10-24 22-28 28-13s13 17 21 2"
              />
              <path
                className="wir-ntile-stroke-accent"
                d="M58 37c6-15 15-22 25-18s8 17-2 23"
              />
            </svg>
          </span>
          <span className="wir-ntile-title">{tile.title}</span>
        </span>
      );
    default:
      return (
        <span className="wir-ntile-body">
          <span className="wir-ntile-title">{tile.title}</span>
        </span>
      );
  }
}
