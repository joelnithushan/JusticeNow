/**
 * JusticeNow — "Know your rights" topic detail (JNOW-39).
 *
 * Renders one guidance topic as a bulleted list of plain-language points,
 * all strings via t() (en/ta/si). Unknown topic ids (e.g. /guidance/xyz) fall
 * back to the topic list rather than rendering an empty page.
 *
 * NOTE ON LEGAL CONTENT: the copy under guidance.topics.* is general
 * information, NOT legal advice, and MUST be reviewed by a qualified lawyer
 * before public release. The lawyer-review caveat is always rendered on this
 * page (guidance.reviewNotice). See also Guidance.jsx.
 */

import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GUIDANCE_TOPICS } from './Guidance';

function GuidanceTopic() {
  const { t } = useTranslation();
  const { topicId } = useParams();

  // Guard the route param against the shared topic list (client/ and the
  // i18n files must not drift apart). Unknown ids redirect to the list.
  if (!GUIDANCE_TOPICS.includes(topicId)) {
    return <Navigate to="/guidance" replace />;
  }

  const points = t(`guidance.topics.${topicId}.points`, { returnObjects: true });

  return (
    <div className="page guidance-page">
      <Link to="/guidance" className="btn-link subtle guidance-back-link">
        &larr; {t('guidance.backToTopics')}
      </Link>

      <h1>{t(`guidance.topics.${topicId}.title`)}</h1>

      {Array.isArray(points) && points.length > 0 ? (
        <ul className="guidance-points">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : (
        // Defensive: a missing/malformed translation block must never render
        // as blank — surface it as content, don't crash.
        <p className="field-error">{t('guidance.notFound')}</p>
      )}

      {/* Lawyer-review caveat. NOT legal advice — must stay visible. */}
      <p className="privacy-note guidance-review-notice" role="note">
        {t('guidance.reviewNotice')}
      </p>
    </div>
  );
}

export default GuidanceTopic;
