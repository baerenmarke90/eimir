import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HEART_MOMENT_CREATE_ROUTE } from '../client/routes';
import {
  clearSharedVoice,
  nativeVoiceShare,
  readSharedVoice,
  stageSharedVoice,
} from '../client/sharedVoiceImport';
import { AudioProcessingContext } from '../client/voiceNotes';
import { useTranslation } from '../i18n';
import { ShortTaskSheet } from './ShortTaskSheet';

export function VoiceShareIngress({ scope }: { scope: string }) {
  const { t } = useTranslation();
  const enabled = useContext(AudioProcessingContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState<{
    generation: string;
    failed: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dismissedAt, setDismissedAt] = useState('');
  const operation = useRef<AbortController | null>(null);
  const ownedGeneration = useRef<string | null>(null);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    let listener: PluginListenerHandle | undefined;
    const inspect = async () => {
      const state = await nativeVoiceShare.peek().catch(() => null);
      if (active && state && (state.available || state.failed)) {
        ownedGeneration.current = state.generation;
        setPending(state);
        setFailed(false);
        setDismissedAt('');
      }
    };
    void nativeVoiceShare
      .addListener('voiceShared', () => void inspect())
      .then((handle) => {
        if (active) listener = handle;
        else void handle.remove();
      });
    void inspect();
    return () => {
      active = false;
      operation.current?.abort();
      void listener?.remove();
      clearSharedVoice(scope);
      if (ownedGeneration.current)
        void nativeVoiceShare
          .discard({ generation: ownedGeneration.current })
          .catch(() => {});
    };
  }, [scope]);
  if (!pending) return null;
  const editing = /\/(new|edit)$/.test(location.pathname);
  async function accept() {
    if (!pending || editing || busy) return;
    const owner = scope;
    const generation = pending.generation;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    try {
      const file = await readSharedVoice(generation, controller.signal);
      if (controller.signal.aborted || currentScope.current !== owner) return;
      const key = stageSharedVoice(owner, file);
      await nativeVoiceShare.discard({ generation });
      if (controller.signal.aborted || currentScope.current !== owner) {
        clearSharedVoice(owner);
        return;
      }
      setPending(null);
      navigate(HEART_MOMENT_CREATE_ROUTE, { state: { voiceImportKey: key } });
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <ShortTaskSheet
      open={dismissedAt !== location.key}
      title={t('voiceNotes.sharedTitle')}
      onClose={() => {
        if (busy) return;
        if (editing) setDismissedAt(location.key);
        else {
          void nativeVoiceShare.discard({ generation: pending.generation });
          setPending(null);
        }
      }}
      isCloseBlocked={busy}
    >
      <p>
        {t(editing ? 'voiceNotes.shareExisting' : 'voiceNotes.sharePrivate')}
      </p>
      {pending.failed || failed ? (
        <p role="alert">{t('voiceNotes.shareFailed')}</p>
      ) : null}
      <button
        type="button"
        disabled={!enabled || editing || busy || pending.failed}
        onClick={() => void accept()}
      >
        {t('voiceNotes.sharedImport')}
      </button>
    </ShortTaskSheet>
  );
}
