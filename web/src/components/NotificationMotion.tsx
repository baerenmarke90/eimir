import type { CSSProperties } from 'react';
import type { NotificationKind } from '../api/generated/models/NotificationKind';
import {
  isPartnerGestureKind,
  isWishDateReceiptKind,
  type PartnerGestureKind,
  type WishDateReceiptKind,
} from '../client/partnerGestureReceipt';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import './NotificationMotion.css';

type NotificationMotionSpec = {
  icon: EimirIconName;
  motion: string;
  accent?: EimirIconName;
};

const motions: Record<
  Exclude<NotificationKind, PartnerGestureKind | WishDateReceiptKind>,
  NotificationMotionSpec
> = {
  ONCE_MESSAGE_RECEIVED: { icon: 'nachrichten', motion: 'message-unfold' },
  GENTLE_PROMPT: { icon: 'sparkle', motion: 'prompt-bloom' },
  REMINDER_CREATED: { icon: 'benachrichtigungen', motion: 'reminder-set' },
  TRANSFER_READY: { icon: 'download', motion: 'download-ready' },
  TRANSFER_COMPLETED: { icon: 'check', motion: 'transfer-done' },
  TRANSFER_FAILED: { icon: 'download', motion: 'transfer-retry' },
  VIDEO_PROCESSING_FAILED: { icon: 'video', motion: 'video-stop' },
  PLAN_CREATED: { icon: 'kalender', motion: 'plan-flip' },
  PLAN_CHANGED: { icon: 'kalender', motion: 'plan-slide' },
  PLAN_CANCELLED: { icon: 'kalender', motion: 'plan-cancel', accent: 'close' },
  WISH_SELECTION_SHARED: {
    icon: 'wuensche',
    motion: 'wish-fan',
    accent: 'square',
  },
  WISH_SELECTION_READY: {
    icon: 'wuensche',
    motion: 'wish-match',
    accent: 'sparkle',
  },
  PHOTO_REACTION: { icon: 'foto', motion: 'photo-reaction', accent: 'denken' },
  PARTNER_JOINED: { icon: 'gemeinsam', motion: 'partner-join' },
  COUPLE_EXPERIENCE_SHARED: { icon: 'momente', motion: 'moment-reveal' },
  COMMENT_CREATED: { icon: 'nachrichten', motion: 'comment-arrive' },
  REMINDER_DUE: { icon: 'benachrichtigungen', motion: 'reminder-ring' },
  WISH_REMINDER_DUE: { icon: 'wuensche', motion: 'wish-reminder' },
};

type MotionStyle = CSSProperties & { '--notification-animation'?: string };

export function NotificationMotion({ kind }: { kind: NotificationKind }) {
  if (isPartnerGestureKind(kind) || isWishDateReceiptKind(kind)) return null;
  const { icon, motion, accent }: NotificationMotionSpec = motions[kind] ?? {
    icon: 'benachrichtigungen',
    motion: '',
  };
  return (
    <span className="notification-motion" data-motion={motion || undefined}>
      <span
        style={
          motion
            ? ({
                '--notification-animation': `notification-${motion}`,
              } as MotionStyle)
            : undefined
        }
      >
        <EimirIcon name={icon} />
      </span>
      {accent ? (
        <span
          className="notification-motion-accent"
          style={
            {
              '--notification-animation': `notification-${motion}-accent`,
            } as MotionStyle
          }
        >
          <EimirIcon name={accent} />
        </span>
      ) : null}
    </span>
  );
}
