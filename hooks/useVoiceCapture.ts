/**
 * useVoiceCapture Hook
 *
 * Handles microphone recording and transcription via OpenAI Whisper.
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { triggerMedium, triggerLight } from '../lib/haptics';
import { shouldUseHaptics } from '../config/featureFlags';
import { callTranscribe } from '../lib/cortex/CortexClient';

export type VoiceCaptureState = 'idle' | 'recording' | 'transcribing' | 'error';

export interface VoiceCaptureResult {
  text: string;
  duration: number;
}

export interface UseVoiceCaptureOptions {
  onTranscribe?: (result: VoiceCaptureResult) => void;
  onError?: (error: string) => void;
  maxDuration?: number;
}

export interface UseVoiceCaptureReturn {
  state: VoiceCaptureState;
  toggle: () => Promise<void>;
  cancel: () => Promise<void>;
  duration: number;
  hasPermission: boolean | null;
  requestPermission: () => Promise<boolean>;
  errorMessage: string | null;
}

export function useVoiceCapture(options: UseVoiceCaptureOptions = {}): UseVoiceCaptureReturn {
  const { onTranscribe, onError, maxDuration = 60 } = options;

  const [state, setState] = useState<VoiceCaptureState>('idle');
  const [duration, setDuration] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    checkPermission();
    return () => {
      cleanup();
    };
  }, []);

  const checkPermission = async () => {
    try {
      const { status } = await Audio.getPermissionsAsync();
      setHasPermission(status === 'granted');
    } catch (e) {
      console.warn('[VoiceCapture] Permission check failed:', e);
      setHasPermission(false);
    }
  };

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      const granted = status === 'granted';
      setHasPermission(granted);
      return granted;
    } catch (e) {
      console.error('[VoiceCapture] Permission request failed:', e);
      setHasPermission(false);
      return false;
    }
  }, []);

  const cleanup = useCallback(async () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (e) {
        // Ignore cleanup errors
      }
      recordingRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // Request permission if needed
      if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) {
          setErrorMessage('Microphone permission required');
          onError?.('Microphone permission required');
          return;
        }
      }

      // Set audio mode FIRST
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Use the HIGH_QUALITY preset - most reliable
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );

      recordingRef.current = recording;
      startTimeRef.current = Date.now();
      setState('recording');
      setDuration(0);
      setErrorMessage(null);

      if (shouldUseHaptics()) {
        triggerMedium();
      }

      durationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);

        if (elapsed >= maxDuration) {
          stopRecording();
        }
      }, 100);

      console.log('[VoiceCapture] Recording started');
    } catch (e) {
      console.error('[VoiceCapture] Failed to start:', e);
      setState('error');
      setErrorMessage('Failed to start recording');
      onError?.('Failed to start recording');
      await cleanup();
    }
  }, [hasPermission, requestPermission, maxDuration, onError, cleanup]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current || state !== 'recording') {
      return;
    }

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    setState('transcribing');

    if (shouldUseHaptics()) {
      triggerLight();
    }

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        throw new Error('No recording URI');
      }

      console.log('[VoiceCapture] Recording stopped, URI:', uri);

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      // File size check not needed - 60s max duration keeps files reasonable
      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      console.log(
        '[VoiceCapture] Audio size:',
        Math.round((base64Audio.length * 0.75) / 1024),
        'KB',
      );

      // HIGH_QUALITY preset uses .m4a
      const result = await callTranscribe(base64Audio, 'm4a');

      if (!result.ok) {
        throw new Error(result.error || 'Transcription failed');
      }

      const transcribedText = result.text?.trim() || '';

      if (!transcribedText) {
        throw new Error('No speech detected. Please try again.');
      }

      console.log('[VoiceCapture] Transcription:', transcribedText.substring(0, 50) + '...');

      setState('idle');
      setDuration(0);
      onTranscribe?.({ text: transcribedText, duration: finalDuration });

      try {
        await FileSystem.deleteAsync(uri);
      } catch (e) {
        // Ignore
      }
    } catch (e) {
      console.error('[VoiceCapture] Transcription failed:', e);
      const message = e instanceof Error ? e.message : 'Transcription failed';
      setState('error');
      setErrorMessage(message);
      onError?.(message);

      setTimeout(() => {
        setState('idle');
        setErrorMessage(null);
      }, 2000);
    }
  }, [state, onTranscribe, onError]);

  const toggle = useCallback(async () => {
    if (state === 'idle' || state === 'error') {
      await startRecording();
    } else if (state === 'recording') {
      await stopRecording();
    }
  }, [state, startRecording, stopRecording]);

  const cancel = useCallback(async () => {
    if (state === 'recording') {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
          const uri = recordingRef.current.getURI();
          if (uri) {
            await FileSystem.deleteAsync(uri);
          }
        } catch (e) {
          // Ignore
        }
        recordingRef.current = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      setState('idle');
      setDuration(0);
      console.log('[VoiceCapture] Cancelled');
    }
  }, [state]);

  return {
    state,
    toggle,
    cancel,
    duration,
    hasPermission,
    requestPermission,
    errorMessage,
  };
}
