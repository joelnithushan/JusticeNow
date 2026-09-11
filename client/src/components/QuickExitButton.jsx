/**
 * JusticeNow — Quick Exit button.
 *
 * Always visible. One tap immediately leaves the app for a neutral website.
 * This is a standard safety feature on domestic-violence and human-rights
 * sites, for the moment someone walks in on the reporter mid-form.
 *
 * How the data is discarded:
 *  - window.location.replace() does a full page navigation, which throws
 *    away ALL React state — including anything typed into the report form.
 *  - replace() (rather than href=) also swaps out the current history
 *    entry, so pressing "back" on the neutral site does not return here.
 *  - Form data is only ever held in React state; we never write it to
 *    localStorage or sessionStorage, so there is nothing left to clear.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

const NEUTRAL_SITE = 'https://www.google.com';

function QuickExitButton() {
  const { t } = useTranslation();

  const exitNow = () => {
    window.location.replace(NEUTRAL_SITE);
  };

  return (
    <button type="button" className="quick-exit" onClick={exitNow}>
      {t('quickExit.label')} ✕
    </button>
  );
}

export default QuickExitButton;
