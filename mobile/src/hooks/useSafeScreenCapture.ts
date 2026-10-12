/**
 * JusticeNow (mobile) — Safe Screen Capture Hook
 *
 * Prevents screen capture/recording on native devices (Android & iOS).
 * On web, window capture prevention is unsupported, so this safely no-ops
 * to prevent UnavailabilityError on web platforms.
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

export function useSafeScreenCapture(key?: string) {
  useEffect(() => {
    if (Platform.OS !== 'web') {
      ScreenCapture.preventScreenCaptureAsync(key).catch(() => {});
      return () => {
        ScreenCapture.allowScreenCaptureAsync(key).catch(() => {});
      };
    }
  }, [key]);
}
