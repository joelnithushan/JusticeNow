/**
 * JusticeNow — Anonymous case submission form.
 *
 * PRIVACY: form data lives ONLY in React state. It is never written to
 * localStorage/sessionStorage, so the Quick Exit button (a full page
 * navigation) discards everything instantly.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { submitReport } from '../api/client';
import { CASE_TYPES, DISTRICTS } from '../constants';

function ReportCase() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [caseType, setCaseType] = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [district, setDistrict] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null);

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Client-side validation mirrors the server's rules so users get
  // instant feedback instead of a round trip.
  const validate = () => {
    const next = {};
    if (!caseType) next.caseType = t('report.errors.caseTypeRequired');
    if (!district) next.district = t('report.errors.districtRequired');
    if (!description.trim()) next.description = t('report.errors.descriptionRequired');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await submitReport({ caseType, incidentDate, district, description, evidenceFile });
      // Pass the code via router state (in memory only — never stored).
      navigate('/report/success', {
        state: { referenceCode: res.data.data.reference_code },
      });
    } catch {
      setSubmitError(t('report.errors.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <h1>{t('report.title')}</h1>
      <p className="privacy-note">{t('report.privacyReassurance')}</p>

      <form onSubmit={handleSubmit} noValidate>
        {/* Case type */}
        <label htmlFor="caseType">{t('report.caseType')}</label>
        <select
          id="caseType"
          value={caseType}
          onChange={(e) => setCaseType(e.target.value)}
        >
          <option value="">{t('report.caseTypePlaceholder')}</option>
          {CASE_TYPES.map((type) => (
            <option key={type} value={type}>{t(`caseTypes.${type}`)}</option>
          ))}
        </select>
        {errors.caseType && <p className="field-error">{errors.caseType}</p>}

        {/* Incident date (optional) */}
        <label htmlFor="incidentDate">
          {t('report.incidentDate')} <span className="optional">({t('common.optional')})</span>
        </label>
        <input
          id="incidentDate"
          type="date"
          value={incidentDate}
          max={new Date().toISOString().split('T')[0]}
          onChange={(e) => setIncidentDate(e.target.value)}
        />

        {/* District */}
        <label htmlFor="district">{t('report.district')}</label>
        <select
          id="district"
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
        >
          <option value="">{t('report.districtPlaceholder')}</option>
          {DISTRICTS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {errors.district && <p className="field-error">{errors.district}</p>}

        {/* Description */}
        <label htmlFor="description">{t('report.description')}</label>
        <textarea
          id="description"
          rows={6}
          value={description}
          placeholder={t('report.descriptionPlaceholder')}
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="privacy-note small">{t('report.descriptionPrivacyHint')}</p>
        {errors.description && <p className="field-error">{errors.description}</p>}

        {/* Evidence (optional) */}
        <label htmlFor="evidence">
          {t('report.evidence')} <span className="optional">({t('common.optional')})</span>
        </label>
        <input
          id="evidence"
          type="file"
          accept="image/*,application/pdf,audio/*,video/*"
          onChange={(e) => setEvidenceFile(e.target.files[0] || null)}
        />
        <p className="privacy-note small">{t('report.evidenceHint')}</p>

        {submitError && <p className="field-error">{submitError}</p>}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? t('report.submitting') : t('report.submit')}
        </button>
      </form>
    </div>
  );
}

export default ReportCase;
