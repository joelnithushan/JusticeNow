/**
 * JusticeNow — "Know your rights" topic list (JNOW-39).
 *
 * Reporter-facing legal literacy: plain-language summaries of the rights a
 * person in Sri Lanka holds during arrest/detention, against discrimination
 * and harassment, and when seeking free legal aid. Every string is looked up
 * through t() so the page renders in en/ta/si like every other page.
 *
 * There is deliberately NO API call and NO state here: the topics are static
 * i18n content (GUIDANCE_TOPICS below is the single source of topic ids), so
 * the page renders instantly and leaves no trace of what a reporter read.
 *
 * NOTE ON LEGAL CONTENT: the copy in i18n/guidance.* is general information,
 * NOT legal advice, and MUST be reviewed by a qualified lawyer before public
 * release. The same lawyer-reviewed caveat is shown to users on the page
 * (guidance.reviewNotice). See also GuidanceTopic.jsx.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * The one list of guidance topic ids. It must stay in sync with the
 * guidance.topics.<id> entries in en.json / ta.json / si.json — the detail
 * page (GuidanceTopic.jsx) validates its route param against this list.
 */
export const GUIDANCE_TOPICS = [
  'arrest_detention',
  'discrimination_harassment',
  'legal_aid',
];

function Guidance() {
  const { t } = useTranslation();

  return (
    <div className="page guidance-page">
      <h1>{t('guidance.title')}</h1>
      <p className="guidance-intro">{t('guidance.intro')}</p>

      <ul className="guidance-topic-list">
        {GUIDANCE_TOPICS.map((id) => (
          <li key={id} className="report-card guidance-topic-card">
            <Link
              to={`/guidance/${id}`}
              className="report-card-header"
              style={{ textDecoration: 'none' }}
            >
              <div className="guidance-topic-title">{t(`guidance.topics.${id}.title`)}</div>
              <div className="report-value guidance-topic-summary">
                {t(`guidance.topics.${id}.summary`)}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Lawyer-review caveat. NOT legal advice — must stay visible. */}
      <p className="privacy-note guidance-review-notice" role="note">
        {t('guidance.reviewNotice')}
      </p>

      <div className="guidance-back">
        <Link to="/" className="btn btn-link">
          {t('common.back')}
        </Link>
      </div>
    </div>
  );
}

export default Guidance;
