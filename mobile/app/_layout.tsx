/**
 * JusticeNow (mobile) — Root layout (expo-router).
 *
 * This is the single entry every screen renders inside. It:
 *  - initialises i18n (the side-effect import sets up en/ta/si + device detect),
 *  - provides the in-memory report draft to the whole tree, and
 *  - renders the navigation Stack.
 *
 * NOTE: the floating Quick Exit button was removed by product decision. The
 * component (components/QuickExitButton.tsx) and the neutral /exit screen remain
 * in the tree but are no longer mounted, so re-enabling is a one-line change.
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
import { OnboardingProvider } from '../src/context/OnboardingContext';
import { PreferencesProvider } from '../src/context/PreferencesContext';
import { AuthProvider } from '../src/context/AuthContext';
import { ProfileProvider } from '../src/context/ProfileContext';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* AuthProvider is outermost among the app providers so BOTH reporter and
        staff screens can read the (in-memory) staff session. */}
      <AuthProvider>
        {/* Inside AuthProvider so it can read the (in-memory) session: it fetches
          the staffer's own profile once authed. Reporter screens have no authed
          session, so it simply never fetches for them. */}
        <ProfileProvider>
          <OnboardingProvider>
            <PreferencesProvider>
              <ReportFormProvider>
                <StatusBar style="light" />
                {/* Headers are hidden: each screen renders its own title. */}
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                  }}
                />
              </ReportFormProvider>
            </PreferencesProvider>
          </OnboardingProvider>
        </ProfileProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
