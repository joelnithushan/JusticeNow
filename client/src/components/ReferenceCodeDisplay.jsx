import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Reusable component to display a reference code.
 * Ensures the code is presented in large, clear type with a copy button
 * and a strict warning about losing it.
 * 
 * @param {Object} props
 * @param {string} props.referenceCode The code to display.
 */
function ReferenceCodeDisplay({ referenceCode }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!referenceCode) return;
    try {
      await navigator.clipboard.writeText(referenceCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy reference code:', err);
    }
  };

  if (!referenceCode) return null;

  return (
    <div className="reference-code-display">
      <div className="reference-code-box">
        <p className="reference-code">{referenceCode}</p>
        <button 
          type="button" 
          onClick={handleCopy} 
          className="btn btn-secondary copy-btn"
        >
          {copied ? t('referenceCode.copied') : t('referenceCode.copy')}
        </button>
      </div>
      <p className="warning"><strong>{t('referenceCode.warning')}</strong></p>
    </div>
  );
}

export default ReferenceCodeDisplay;
