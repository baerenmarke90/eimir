// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  clearSharedVoice,
  stageSharedVoice,
  takeSharedVoice,
} from './sharedVoiceImport';
import { VOICE_MAX_BYTES, voiceFile, voiceTime } from './voiceNotes';

describe('voice input and volatile sharing ownership', () => {
  it('normalizes actual WhatsApp/recording container labels without trusting names for validation', () => {
    expect(voiceFile(new File(['audio'], 'selected.opus')).type).toBe(
      'audio/ogg',
    );
    expect(
      voiceFile(new File(['audio'], 'voice', { type: 'audio/opus' })).type,
    ).toBe('audio/ogg');
    expect(
      voiceFile(
        new File(['audio'], 'private-name.m4a', { type: 'audio/x-m4a' }),
      ).name,
    ).toBe('voice.m4a');
    expect(
      voiceFile(
        new File(['audio'], 'voice.webm', { type: 'audio/webm;codecs=opus' }),
      ).type,
    ).toBe('audio/webm');
    expect(() => voiceFile(new File(['x'], 'evil.html'))).toThrow(
      'unsupported',
    );
    expect(() => voiceFile(new File([], 'empty.opus'))).toThrow('empty');
  });
  it('rejects oversized input before creating an upload', () => {
    expect(() =>
      voiceFile(new File([new Uint8Array(VOICE_MAX_BYTES + 1)], 'large.ogg')),
    ).toThrow('tooLarge');
  });
  it('hands off one file only to its exact account, instance, Space and key', () => {
    const file = new File(['audio'], 'voice.ogg');
    const key = stageSharedVoice('instance/account/space', file);
    expect(takeSharedVoice('other', key)).toBeNull();
    expect(takeSharedVoice('instance/account/space', 'wrong')).toBeNull();
    expect(takeSharedVoice('instance/account/space', key)).toBe(file);
    expect(takeSharedVoice('instance/account/space', key)).toBeNull();
    const next = stageSharedVoice('owner', file);
    clearSharedVoice('owner');
    expect(takeSharedVoice('owner', next)).toBeNull();
  });
  it('formats bounded durations without invalid numeric values', () => {
    expect(voiceTime(24.8)).toBe('0:24');
    expect(voiceTime(180)).toBe('3:00');
    expect(voiceTime(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});
