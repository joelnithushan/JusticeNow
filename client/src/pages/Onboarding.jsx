/**
 * JusticeNow — Onboarding flow (3 slides).
 *
 *   1 · language   "Choose your language"      → sets the app language
 *   2 · privacy    "You stay anonymous"        → what we never ask for
 *   3 · safety     "Leave instantly, any time" → the Quick Exit control
 *
 * ROUTING
 * Each slide is its own URL (/onboarding/<step>), so the browser Back button
 * moves between slides naturally and an explicit Back control can too. Continue
 * advances; the last slide's "Get started" and every slide's Skip go to home.
 *
 * PRIVACY — no trace on the device
 * There is deliberately NO "hasSeenOnboarding" flag in localStorage or
 * sessionStorage. This app must leave nothing behind, so we accept that a fresh
 * visit shows onboarding again rather than recording that it was seen. The
 * language the user picks on slide 1 lives only in i18next's in-memory state and
 * carries forward to slides 2 and 3 (and the rest of the app) on its own — we
 * never reset it.
 */

import React from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import OnboardingSlide from '../components/OnboardingSlide';
import {
  LanguageArt,
  PrivacyDocArt,
  DoorwayArt,
  QuickExitReplica,
  TickGlyph,
} from '../components/OnboardingIllustrations';

// Slide order. The URL param (:step) is one of these keys.
const STEPS = ['language', 'privacy', 'safety'];

// Languages, each labelled in its own script so a user can find their language
// even while the app is showing one they cannot read (mirrors LanguageSwitcher).
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'si', label: 'සිංහල' },
];

const HOME_PATH = '/';

function Onboarding() {
  const { step } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const index = STEPS.indexOf(step);

  // Unknown / missing step → start at the beginning. replace: no dead history.
  if (index === -1) {
    return <Navigate to={`/onboarding/${STEPS[0]}`} replace />;
  }

  const isLast = index === STEPS.length - 1;

  const goHome = () => navigate(HOME_PATH);
  const goNext = () =>
    isLast ? goHome() : navigate(`/onboarding/${STEPS[index + 1]}`);
  // Back only exists from slide 2 onward.
  const goBack =
    index === 0 ? undefined : () => navigate(`/onboarding/${STEPS[index - 1]}`);

  // Shared props for the frame. The primary label changes on the final slide
  // ("Get started" instead of "Continue") because it leaves the flow.
  const frame = {
    step: index + 1,
    onSkip: goHome,
    onPrimary: goNext,
    onBack: goBack,
    primaryLabel: isLast ? t('onboarding.getStarted') : t('onboarding.continue'),
  };

  if (step === 'language') {
    return (
      <OnboardingSlide
        {...frame}
        contextLabel={t('onboarding.language.context')}
        headingId="onboarding-language-heading"
        heading={t('onboarding.language.heading')}
        illustration={<LanguageArt />}
      >
        <p className="onboarding-body">{t('onboarding.language.body')}</p>

        <div
          className="onboarding-lang-options"
          role="group"
          aria-label={t('onboarding.language.context')}
        >
          {LANGUAGES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              className={
                i18n.language === code
                  ? 'onboarding-lang-option is-active'
                  : 'onboarding-lang-option'
              }
              aria-pressed={i18n.language === code}
              onClick={() => i18n.changeLanguage(code)}
            >
              {label}
            </button>
          ))}
        </div>
      </OnboardingSlide>
    );
  }

  if (step === 'privacy') {
    const reassurances = [
      t('onboarding.privacy.reassure1'),
      t('onboarding.privacy.reassure2'),
      t('onboarding.privacy.reassure3'),
    ];
    return (
      <OnboardingSlide
        {...frame}
        contextLabel={t('onboarding.privacy.context')}
        headingId="onboarding-privacy-heading"
        heading={t('onboarding.privacy.heading')}
        illustration={<PrivacyDocArt />}
      >
        <p className="onboarding-body">{t('onboarding.privacy.body')}</p>
        <p className="onboarding-body">{t('onboarding.privacy.body2')}</p>

        <ul className="onboarding-reassure">
          {reassurances.map((item) => (
            <li key={item}>
              <TickGlyph />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </OnboardingSlide>
    );
  }

  // step === 'safety'
  return (
    <OnboardingSlide
      {...frame}
      contextLabel={t('onboarding.safety.context')}
      headingId="onboarding-safety-heading"
      heading={t('onboarding.safety.heading')}
      illustration={<DoorwayArt />}
    >
      <p className="onboarding-body">{t('onboarding.safety.body')}</p>
      <p className="onboarding-body">{t('onboarding.safety.body2')}</p>

      {/* A static picture of the real Quick Exit control, so it is recognised
          later. It does nothing here — there is no case data yet to clear. */}
      <figure className="onboarding-exit-demo">
        <QuickExitReplica />
        <figcaption>{t('onboarding.safety.exitReplicaLabel')}</figcaption>
      </figure>
    </OnboardingSlide>
  );
}

export default Onboarding;
