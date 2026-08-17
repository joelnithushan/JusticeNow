/**
 * JusticeNow (mobile) — Anonymous case submission (3-step form).
 *
 * Ported from /client/src/pages/ReportCase.jsx. The web version is a single
 * page; here the same fields are split across three steps for a phone-sized
 * screen, but the LOGIC and VALIDATION rules are the same, and the error
 * messages come from the same i18n keys.
 *
 * PRIVACY (critical):
 *  - All form data lives in the in-memory ReportFormContext only. It is NEVER
 *    written to AsyncStorage/SecureStore. Quick Exit calls reset() and it is
 *    gone. On successful submit we also reset() so nothing lingers in memory.
 *  - We never log case contents. Do not add console.log of the draft.
 *  - No field identifies the reporter — no name, email, phone or device id.
 *
 * Steps:
 *  1. Case type (radio-style) + optional incident date (cannot be in the future)
 *  2. District (picker, 25 districts) + description (min 20 characters)
 *  3. Optional evidence (JPG/PNG/WebP/PDF, max 5MB) + review summary + submit
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';

import { useReportForm } from '../../src/context/ReportFormContext';
import { submitReport } from '../../src/api/client';
import {
  CASE_TYPES,
  DISTRICTS,
  MAX_EVIDENCE_BYTES,
  ALLOWED_EVIDENCE_MIME,
  MIN_DESCRIPTION_LENGTH,
} from '../../src/constants';
import { colors, styles as theme } from '../../src/theme';

const TOTAL_STEPS = 3;

// Format a Date as 'YYYY-MM-DD' using LOCAL parts (not toISOString, which
// shifts to UTC and can move the date across midnight). This string is what
// the API expects for incident_date.
function formatDateForApi(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type FieldErrors = Record<string, string>;

export default function ReportCase() {
  const { t } = useTranslation();
  const router = useRouter();
  const { draft, setField, reset } = useReportForm();

  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ---- Per-step validation (mirrors the web + server rules) ----
  const validateStep1 = (): boolean => {
    const next: FieldErrors = {};
    if (!draft.caseType) next.caseType = t('report.errors.caseTypeRequired');
    // Incident date is optional. The picker blocks future dates, but we guard
    // anyway so the rule holds even if the platform lets one through.
    if (draft.incidentDate && draft.incidentDate.getTime() > Date.now()) {
      next.incidentDate = t('report.wizard.dateInFuture');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateStep2 = (): boolean => {
    const next: FieldErrors = {};
    if (!draft.district) next.district = t('report.errors.districtRequired');
    const trimmed = draft.description.trim();
    if (!trimmed) {
      next.description = t('report.errors.descriptionRequired');
    } else if (trimmed.length < MIN_DESCRIPTION_LENGTH) {
      next.description = t('report.wizard.descriptionTooShort');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    const ok = step === 1 ? validateStep1() : step === 2 ? validateStep2() : true;
    if (ok) {
      setErrors({});
      setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    }
  };

  const goBack = () => {
    setErrors({});
    if (step === 1) {
      router.back();
    } else {
      setStep((s) => Math.max(s - 1, 1));
    }
  };

  // ---- Evidence picker (step 3) ----
  const pickEvidence = async () => {
    setErrors((e) => ({ ...e, evidence: '' }));
    const result = await DocumentPicker.getDocumentAsync({
      type: ALLOWED_EVIDENCE_MIME,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;

    const asset = result.assets[0];

    // Validate type. Some platforms report an empty mimeType, so fall back to
    // the filename extension.
    const mime = asset.mimeType ?? '';
    const nameLower = asset.name?.toLowerCase() ?? '';
    const extOk = /\.(jpe?g|png|webp|pdf)$/.test(nameLower);
    const typeOk = ALLOWED_EVIDENCE_MIME.includes(mime) || extOk;
    if (!typeOk) {
      setErrors((e) => ({ ...e, evidence: t('report.wizard.evidenceType') }));
      return;
    }

    // Validate size (5 MB cap on the client; the server also enforces a limit).
    if (typeof asset.size === 'number' && asset.size > MAX_EVIDENCE_BYTES) {
      setErrors((e) => ({ ...e, evidence: t('report.wizard.evidenceTooBig') }));
      return;
    }

    setField('evidenceFile', asset);
  };

  // ---- Submit (step 3) ----
  const handleSubmit = async () => {
    setSubmitError('');
    // Re-run the earlier steps' rules so a submit can never bypass them.
    if (!validateStep1()) {
      setStep(1);
      return;
    }
    if (!validateStep2()) {
      setStep(2);
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitReport({
        caseType: draft.caseType,
        incidentDate: draft.incidentDate ? formatDateForApi(draft.incidentDate) : '',
        district: draft.district,
        description: draft.description.trim(),
        evidenceFile: draft.evidenceFile,
      });
      const referenceCode = res.data.data.reference_code;
      // Clear the draft from memory before leaving this screen.
      reset();
      // Pass the code as a route param (in memory only — never stored).
      router.replace({ pathname: '/report/success', params: { referenceCode } });
    } catch {
      // Do NOT log the error object — it can contain the request body.
      setSubmitError(t('report.errors.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={theme.page}>
      <Text style={theme.h1}>{t('report.title')}</Text>
      <Text style={local.stepIndicator}>
        {t('report.wizard.step', { current: step, total: TOTAL_STEPS })}
      </Text>
      <Text style={theme.privacyNote}>{t('report.privacyReassurance')}</Text>

      {step === 1 && (
        <View>
          {/* Case type — radio-style options */}
          <Text style={theme.label}>{t('report.caseType')}</Text>
          {CASE_TYPES.map((type) => {
            const selected = draft.caseType === type;
            return (
              <Pressable
                key={type}
                onPress={() => setField('caseType', type)}
                style={[local.radioRow, selected && local.radioRowSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <View style={[local.radioDot, selected && local.radioDotSelected]} />
                <Text style={local.radioLabel}>{t(`caseTypes.${type}`)}</Text>
              </Pressable>
            );
          })}
          {errors.caseType ? <Text style={theme.fieldError}>{errors.caseType}</Text> : null}

          {/* Incident date — optional, cannot be in the future */}
          <Text style={theme.label}>
            {t('report.incidentDate')}{' '}
            <Text style={theme.optional}>({t('common.optional')})</Text>
          </Text>
          <Pressable
            style={theme.input}
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
          >
            <Text style={{ color: draft.incidentDate ? colors.text : colors.muted }}>
              {draft.incidentDate
                ? draft.incidentDate.toLocaleDateString()
                : t('report.wizard.selectDate')}
            </Text>
          </Pressable>
          {draft.incidentDate ? (
            <Pressable onPress={() => setField('incidentDate', null)} style={theme.btnLink}>
              <Text style={theme.btnLinkText}>{t('report.wizard.clearDate')}</Text>
            </Pressable>
          ) : null}
          {errors.incidentDate ? (
            <Text style={theme.fieldError}>{errors.incidentDate}</Text>
          ) : null}

          {showDatePicker && (
            <DateTimePicker
              value={draft.incidentDate ?? new Date()}
              mode="date"
              // Enforce "not in the future" at the UI level.
              maximumDate={new Date()}
              onChange={(event, selectedDate) => {
                // Android shows a modal that must be dismissed; iOS is inline.
                setShowDatePicker(Platform.OS === 'ios');
                if (event.type === 'set' && selectedDate) {
                  setField('incidentDate', selectedDate);
                }
              }}
            />
          )}
          {Platform.OS === 'ios' && showDatePicker ? (
            <Pressable style={theme.btnSecondary} onPress={() => setShowDatePicker(false)}>
              <Text style={theme.btnSecondaryText}>{t('common.back')}</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {step === 2 && (
        <View>
          {/* District */}
          <Text style={theme.label}>{t('report.district')}</Text>
          <View style={theme.pickerWrapper}>
            <Picker
              selectedValue={draft.district}
              onValueChange={(value) => setField('district', String(value))}
              accessibilityLabel={t('report.district')}
            >
              <Picker.Item label={t('report.districtPlaceholder')} value="" />
              {DISTRICTS.map((d) => (
                <Picker.Item key={d} label={d} value={d} />
              ))}
            </Picker>
          </View>
          {errors.district ? <Text style={theme.fieldError}>{errors.district}</Text> : null}

          {/* Description */}
          <Text style={theme.label}>{t('report.description')}</Text>
          {/* Use a plain multiline TextInput; import kept local to this block */}
          <DescriptionInput
            value={draft.description}
            onChangeText={(text) => setField('description', text)}
            placeholder={t('report.descriptionPlaceholder')}
          />
          <Text style={theme.privacyNoteSmall}>{t('report.descriptionPrivacyHint')}</Text>
          {errors.description ? (
            <Text style={theme.fieldError}>{errors.description}</Text>
          ) : null}
        </View>
      )}

      {step === 3 && (
        <View>
          {/* Evidence — optional */}
          <Text style={theme.label}>
            {t('report.evidence')}{' '}
            <Text style={theme.optional}>({t('common.optional')})</Text>
          </Text>
          <Text style={theme.privacyNoteSmall}>{t('report.evidenceHint')}</Text>
          <Pressable style={theme.btnSecondary} onPress={pickEvidence}>
            <Text style={theme.btnSecondaryText}>
              {draft.evidenceFile ? t('report.wizard.changeFile') : t('report.wizard.chooseFile')}
            </Text>
          </Pressable>
          {draft.evidenceFile ? (
            <View style={local.fileRow}>
              <Text style={local.fileName} numberOfLines={1}>
                {draft.evidenceFile.name}
              </Text>
              <Pressable onPress={() => setField('evidenceFile', null)}>
                <Text style={theme.btnLinkText}>{t('report.wizard.removeFile')}</Text>
              </Pressable>
            </View>
          ) : null}
          {errors.evidence ? <Text style={theme.fieldError}>{errors.evidence}</Text> : null}

          {/* Review summary */}
          <Text style={[theme.label, { marginTop: 24 }]}>{t('report.wizard.review')}</Text>
          <ReviewRow label={t('report.caseType')} value={t(`caseTypes.${draft.caseType}`)} />
          <ReviewRow
            label={t('report.incidentDate')}
            value={
              draft.incidentDate
                ? draft.incidentDate.toLocaleDateString()
                : t('report.wizard.notProvided')
            }
          />
          <ReviewRow label={t('report.district')} value={draft.district} />
          <ReviewRow label={t('report.description')} value={draft.description.trim()} />
          <ReviewRow
            label={t('report.evidence')}
            value={draft.evidenceFile ? draft.evidenceFile.name : t('report.wizard.notProvided')}
          />

          {submitError ? <Text style={theme.fieldError}>{submitError}</Text> : null}

          <Pressable
            style={[theme.btnPrimary, submitting && theme.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            accessibilityRole="button"
          >
            {submitting ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={theme.btnPrimaryText}>{t('report.submit')}</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* Wizard navigation (Next appears on steps 1 & 2) */}
      {step < TOTAL_STEPS && (
        <Pressable style={theme.btnPrimary} onPress={goNext} accessibilityRole="button">
          <Text style={theme.btnPrimaryText}>{t('report.wizard.next')}</Text>
        </Pressable>
      )}
      <Pressable style={theme.btnLink} onPress={goBack} accessibilityRole="button">
        <Text style={theme.btnLinkText}>{t('common.back')}</Text>
      </Pressable>
    </ScrollView>
  );
}

// --- Small presentational helpers kept in this file for cohesion ---

// Multiline description input. Split out only to keep the step 2 block readable.
function DescriptionInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      style={[theme.input, theme.textarea]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      multiline
      numberOfLines={6}
    />
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={local.reviewRow}>
      <Text style={local.reviewLabel}>{label}</Text>
      <Text style={local.reviewValue}>{value}</Text>
    </View>
  );
}

const local = StyleSheet.create({
  stepIndicator: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 12,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginBottom: 8,
  },
  radioRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.secondary,
  },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 12,
  },
  radioDotSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  radioLabel: {
    fontSize: 15,
    color: colors.text,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 12,
  },
  fileName: {
    flex: 1,
    color: colors.text,
  },
  reviewRow: {
    marginBottom: 10,
  },
  reviewLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  reviewValue: {
    fontSize: 15,
    color: colors.text,
  },
});
