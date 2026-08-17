/**
 * JusticeNow (mobile) — Root layout (expo-router).
 *
 * This is the single entry every screen renders inside. It:
 *  - initialises i18n (the side-effect import sets up en/ta/si + device detect),
 *  - provides the in-memory report draft to the whole tree,
 *  - renders the navigation Stack, and
 *  - mounts the Quick Exit button ONCE so it floats over every screen.
 *
 * Screen files live in /app and become routes by their filename:
 *   app/index.tsx        -> "/"            (Home)
 *   app/report/index.tsx -> "/report"      (3-step report form)
 *   app/report/success   -> "/report/success"
 *   app/status.tsx       -> "/status"
 *   app/directory.tsx    -> "/directory"
 *   app/staff/login.tsx  -> "/staff/login"
 *   app/staff/reports    -> "/staff/reports"
 */

import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Side-effect import: initialises i18next before any screen uses t().
import '../src/i18n';
import { ReportFormProvider } from '../src/context/ReportFormContext';
import QuickExitButton from '../components/QuickExitButton';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ReportFormProvider>
        <StatusBar style="light" />
        {/* Headers are hidden: each screen renders its own title, and the
            Quick Exit button floats above everything via the overlay below. */}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        {/* Rendered last so it sits on top of whatever screen is showing. */}
        <QuickExitButton />
      </ReportFormProvider>
    </SafeAreaProvider>
  );
}
