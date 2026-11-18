import {
  Capacitor,
  type PluginListenerHandle,
  registerPlugin,
} from '@capacitor/core';
import { VOICE_MAX_BYTES, voiceFile } from './voiceNotes';

interface SharedVoice {
  available: boolean;
  failed: boolean;
  generation: string;
}
export const nativeVoiceShare = registerPlugin<{
  peek(): Promise<SharedVoice>;
  read(options: {
    generation: string;
  }): Promise<{ uri: string; mimeType: string }>;
  discard(options?: { generation?: string }): Promise<void>;
  addListener(
    event: 'voiceShared',
    callback: () => void,
  ): Promise<PluginListenerHandle>;
}>('VoiceShare');
let draft: { scope: string; key: string; file: File } | null = null;
export function stageSharedVoice(scope: string, file: File): string {
  const key = crypto.randomUUID();
  draft = { scope, key, file };
  return key;
}
export function takeSharedVoice(scope: string, key: string): File | null {
  if (!draft || draft.scope !== scope || draft.key !== key) return null;
  const file = draft.file;
  draft = null;
  return file;
}
export function clearSharedVoice(scope: string): void {
  if (draft?.scope === scope) draft = null;
}
export async function readSharedVoice(
  generation: string,
  signal: AbortSignal,
): Promise<File> {
  const result = await nativeVoiceShare.read({ generation });
  if (
    !/^content:\/\/de\.eimir\.app(?:\.debug)?\.selectedmedia\/[a-f0-9-]+$/.test(
      result.uri,
    )
  )
    throw new Error('Invalid voice selection');
  const response = await fetch(Capacitor.convertFileSrc(result.uri), {
    signal,
  });
  if (!response.ok || !response.body)
    throw new Error('Voice selection unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  try {
    while (true) {
      if (signal.aborted)
        throw new DOMException('Import aborted', 'AbortError');
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > VOICE_MAX_BYTES)
        throw new Error('Voice selection exceeds limit');
      chunks.push(new Uint8Array(chunk.value));
    }
    return voiceFile(new File(chunks, 'voice', { type: result.mimeType }));
  } finally {
    await reader.cancel().catch(() => {});
  }
}
