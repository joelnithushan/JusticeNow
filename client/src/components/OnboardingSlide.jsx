/**
 * JusticeNow — Onboarding slide scaffold.
 *
 * All three onboarding slides share this ONE frame — step indicator, Skip,
 * illustration slot, heading, body and a bottom action row — so the flow reads
 * as a single sequence rather than three separate designs. Slide-specific
 * content (the illustration, the body, the primary label) is passed in.
 *
 * The frame never stores anything and never touches the language: the language
 * chosen on slide 1 lives in i18next's in-memory state and simply carries
 * forward as the user advances.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

const TOTAL_STEPS = 3;

function OnboardingSlide({
  step, // 1 | 2 | 3
  contextLabel, // already-translated right-hand label ("Your privacy" …)
  headingId, // ties the <section> to its heading for assistive tech
  heading, // already-translated heading text
  illustration, // node: an inline SVG that is itself aria-hidden
  children, // slide body
  primaryLabel, // already-translated label ("Continue" / "Get started")
  onPrimary,
  onSkip,
  onBack, // optional — omitted on the first slide
}) {
  const { t } = useTranslation();

  return (
    <section className="onboarding-slide" aria-labelledby={headingId}>
      {/* Skip sits top-right on every slide and always goes straight home. */}
      <div className="onboarding-topbar">
        <button type="button" className="onboarding-skip" onClick={onSkip}>
          {t('onboarding.skip')}
        </button>
      </div>

      {/* Progress: "Step 2 of 3" on the left, the section label on the right. */}
      <div className="onboarding-progress">
        <div className="onboarding-progress-row">
          <span className="onboarding-step">
            {t('onboarding.step', { current: step, total: TOTAL_STEPS })}
          </span>
          <span className="onboarding-context">{contextLabel}</span>
        </div>
        {/* Visual mirror of the step text; the text above already states it, so
            the segments are decorative and hidden from assistive tech. */}
        <span className="onboarding-segments" aria-hidden="true">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <span
              key={i}
              className={
                i < step ? 'onboarding-segment is-filled' : 'onboarding-segment'
              }
            />
          ))}
        </span>
      </div>

      <div className="onboarding-content">
        <div className="onboarding-illustration">{illustration}</div>
        <h1 id={headingId} className="onboarding-heading">
          {heading}
        </h1>
        {children}
      </div>

      <div className="onboarding-actions">
        {onBack && (
          <button
            type="button"
            className="btn btn-secondary onboarding-back"
            onClick={onBack}
          >
            {t('onboarding.back')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary onboarding-primary"
          onClick={onPrimary}
        >
          {primaryLabel}
        </button>
      </div>
    </section>
  );
}

export default OnboardingSlide;
