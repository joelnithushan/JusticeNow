/**
 * JusticeNow (mobile) — Anonymous case submission (5-step wizard).
 *
 * Expanded from the original 3-step form to capture a fuller, victim- AND
 * witness-oriented report while STILL being anonymous by construction. The steps:
 *   1. Incident   — reporter type, category (+ custom), title
 *   2. Details    — what happened, people involved, victim info
 *   3. Location   — date, time (each with an "approximate" flag), district, place
 *   4. Evidence   — evidence + description, other witnesses, immediate risk,
 *                   previous reporting, assistance requested, extra info
 *   5. Review     — summary with per-section edit, anonymity confirm, submit
 *
 * PRIVACY (critical, unchanged):
 *  - The whole draft lives in the in-memory ReportFormContext ONLY. It is NEVER
 *    written to AsyncStorage/SecureStore. On submit (and Quick Exit, if enabled)
 *    reset() wipes it. No field identifies the reporter — the UI never asks for a
 *    name, email, phone, NIC or address.
 *  - We never log case contents.
 *
 * VALIDATION: only the minimum is required — reporter type, category, a
 * description, and the final anonymity confirmation. Everything else is optional.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import Svg, { Circle, Path } from 'react-native-svg';

import ReporterTopBar from '../../components/ReporterTopBar';
import SelectField, { type Option } from '../../components/SelectField';
import LocationPickerModal from '../../components/LocationPickerModal';
import { useReportForm } from '../../src/context/ReportFormContext';
import { submitReport } from '../../src/api/client';
import {
  CASE_TYPES,
  DISTRICTS,
  REPORTER_TYPES,
  ASSISTANCE_TYPES,
  TRISTATE,
  PRIOR_REPORT_SOURCES,
  MAX_EVIDENCE_BYTES,
  ALLOWED_EVIDENCE_MIME,
} from '../../src/constants';
import { colors, styles as theme } from '../../src/theme';

const TOTAL_STEPS = 5;

// Format a Date as 'YYYY-MM-DD' using LOCAL parts (not toISOString, which shifts
// to UTC and can move the date across midnight). This is what the API expects.
function formatDateForApi(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// A human-friendly local time label (e.g. "6:30 PM"). Stored as a display string
// in the (text) incident_time column.
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// A small map-pin for the "Pick on map" button.
function PinIconSmall({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21 C12 21 5 14.5 5 9 a7 7 0 0 1 14 0 C19 14.5 12 21 12 21 Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={9} r={2.5} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

// A muted circle with a white × — the inline "clear" affordance for the date.
function ClearIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill={colors.muted} />
      <Path d="M9 9 l6 6 M15 9 l-6 6" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export default function ReportCase() {
  const { t } = useTranslation();
  const router = useRouter();
  const { draft, setField, reset } = useReportForm();

  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The time picker works on a Date; we store the chosen time back to the draft
  // as a display string (the column is text). Seeded to a sensible default.
  const [timeValue, setTimeValue] = useState<Date>(new Date());
  const [showMap, setShowMap] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ---- Per-step validation. Only the minimum is enforced. ----
  const validateStep = (s: number): boolean => {
    const next: Record<string, string> = {};
    if (s === 1) {
      if (!draft.reporterType) next.reporterType = t('report.errors.reporterTypeRequired');
      if (!draft.caseType) next.caseType = t('report.errors.categoryRequired');
    }
    if (s === 2) {
      if (!draft.description.trim()) next.description = t('report.errors.descriptionRequired');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (validateStep(step)) {
      setErrors({});
      setStep((v) => Math.min(v + 1, TOTAL_STEPS));
    }
  };
  const goBack = () => {
    setErrors({});
    // Earlier steps: go to the previous step. At step 1: leave the form — pop the
    // stack if we can, otherwise fall back to Home so the arrow always works
    // (e.g. when the screen was deep-linked and there is nothing to pop).
    if (step > 1) {
      setStep((v) => Math.max(v - 1, 1));
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };
  const goToStep = (s: number) => {
    setErrors({});
    setStep(s);
  };

  // ---- Evidence picker (step 4) ----
  const pickEvidence = async () => {
    setErrors((e) => ({ ...e, evidence: '' }));
    const result = await DocumentPicker.getDocumentAsync({
      type: ALLOWED_EVIDENCE_MIME,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? '';
    const nameLower = asset.name?.toLowerCase() ?? '';
    const extOk = /\.(jpe?g|png|webp|pdf)$/.test(nameLower);
    if (!(ALLOWED_EVIDENCE_MIME.includes(mime) || extOk)) {
      setErrors((e) => ({ ...e, evidence: t('report.wizard.evidenceType') }));
      return;
    }
    if (typeof asset.size === 'number' && asset.size > MAX_EVIDENCE_BYTES) {
      setErrors((e) => ({ ...e, evidence: t('report.wizard.evidenceTooBig') }));
      return;
    }
    setField('evidenceFile', asset);
  };

  const toggleAssistance = (value: string) => {
    const has = draft.assistanceRequested.includes(value);
    setField(
      'assistanceRequested',
      has
        ? draft.assistanceRequested.filter((a) => a !== value)
        : [...draft.assistanceRequested, value],
    );
  };

  // ---- Submit (step 5) ----
  const handleSubmit = async () => {
    setSubmitError('');
    if (!confirmed) {
      setErrors({ confirm: t('report.errors.confirmRequired') });
      return;
    }
    if (!validateStep(1)) {
      setStep(1);
      return;
    }
    if (!validateStep(2)) {
      setStep(2);
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitReport({
        reporterType: draft.reporterType,
        caseType: draft.caseType,
        customCategory: draft.caseType === 'other' ? draft.customCategory : '',
        title: draft.title,
        description: draft.description.trim(),
        peopleInvolved: draft.peopleInvolved,
        victimInformation: draft.victimInformation,
        incidentDate: draft.incidentDate ? formatDateForApi(draft.incidentDate) : '',
        incidentDateApproximate: draft.incidentDateApproximate,
        incidentTime: draft.incidentTime,
        incidentTimeApproximate: draft.incidentTimeApproximate,
        district: draft.district,
        locationName: draft.locationName,
        evidenceFile: draft.evidenceFile,
        evidenceDescription: draft.evidenceDescription,
        otherWitnesses: draft.otherWitnesses,
        witnessDetails: draft.witnessDetails,
        immediateRisk: draft.immediateRisk,
        previouslyReported: draft.previouslyReported,
        previousReportDetails: draft.previousReportDetails,
        assistanceRequested: draft.assistanceRequested,
        additionalInformation: draft.additionalInformation,
      });
      const referenceCode = res.data.data.reference_code;
      reset();
      router.replace({ pathname: '/report/success', params: { referenceCode } });
    } catch {
      // Never log the error — it can contain the request body.
      setSubmitError(t('report.errors.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const categoryOptions: Option[] = CASE_TYPES.map((c) => ({
    value: c,
    label: t(`caseTypes.${c}`),
  }));
  const districtOptions: Option[] = DISTRICTS.map((d) => ({ value: d, label: d }));

  return (
    <View style={local.screen}>
      {/* The header arrow steps back through the wizard (and leaves the form at
          step 1) — a single, clear back affordance, so no text "Back" link. */}
      <ReporterTopBar title={t('report.title')} onBack={goBack} />

      {/* Progress: a 5-step icon stepper (completed / current / upcoming). */}
      <StepIndicator step={step} />

      <ScrollView contentContainerStyle={local.body} keyboardShouldPersistTaps="handled">
        {/* Anonymity reassurance, shown on every step. */}
        <View style={local.anonBanner}>
          <Text style={local.anonText}>{t('report.anonymousBanner')}</Text>
        </View>

        {/* ───────── Step 1 — Incident ───────── */}
        {step === 1 && (
          <View>
            <RadioGroup
              label={t('report.reporterType')}
              options={REPORTER_TYPES.map((r) => ({ value: r, label: t(`reporterTypes.${r}`) }))}
              value={draft.reporterType}
              onChange={(v) => {
                setField('reporterType', v);
                setErrors((e) => ({ ...e, reporterType: '' }));
              }}
              error={errors.reporterType}
            />

            <View style={local.selectWrap}>
              <SelectField
                label={t('report.category')}
                required
                placeholder={t('report.categoryPlaceholder')}
                value={draft.caseType || null}
                options={categoryOptions}
                onChange={(v) => {
                  setField('caseType', v);
                  setErrors((e) => ({ ...e, caseType: '' }));
                }}
                sheetTitle={t('report.category')}
              />
              {errors.caseType ? <Text style={theme.fieldError}>{errors.caseType}</Text> : null}
            </View>

            {draft.caseType === 'other' ? (
              <Labelled label={t('report.customCategory')}>
                <TextInput
                  style={theme.input}
                  value={draft.customCategory}
                  onChangeText={(v) => setField('customCategory', v)}
                  placeholder={t('report.customCategoryPlaceholder')}
                  placeholderTextColor={colors.muted}
                />
              </Labelled>
            ) : null}

            <Labelled label={t('report.caseTitle')} hint={t('report.caseTitleHint')}>
              <TextInput
                style={theme.input}
                value={draft.title}
                onChangeText={(v) => setField('title', v)}
                placeholder={t('report.caseTitlePlaceholder')}
                placeholderTextColor={colors.muted}
              />
            </Labelled>
          </View>
        )}

        {/* ───────── Step 2 — Details ───────── */}
        {step === 2 && (
          <View>
            <Labelled label={t('report.whatHappened')} required>
              <TextInput
                style={[theme.input, theme.textarea]}
                value={draft.description}
                onChangeText={(v) => {
                  setField('description', v);
                  setErrors((e) => ({ ...e, description: '' }));
                }}
                placeholder={t('report.whatHappenedPlaceholder')}
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={6}
              />
              {errors.description ? (
                <Text style={theme.fieldError}>{errors.description}</Text>
              ) : null}
            </Labelled>

            <Labelled label={t('report.peopleInvolved')} hint={t('report.peopleInvolvedHint')}>
              <TextInput
                style={[theme.input, theme.textarea]}
                value={draft.peopleInvolved}
                onChangeText={(v) => setField('peopleInvolved', v)}
                placeholder={t('report.peopleInvolvedPlaceholder')}
                placeholderTextColor={colors.muted}
                multiline
              />
            </Labelled>

            <Labelled label={t('report.victimInfo')} hint={t('report.victimInfoHint')}>
              <TextInput
                style={[theme.input, theme.textarea]}
                value={draft.victimInformation}
                onChangeText={(v) => setField('victimInformation', v)}
                placeholder={t('report.victimInfoPlaceholder')}
                placeholderTextColor={colors.muted}
                multiline
              />
            </Labelled>
          </View>
        )}

        {/* ───────── Step 3 — Location & Time ───────── */}
        {step === 3 && (
          <View>
            {/* Incident date — a single compact native picker (tap the pill to
                open the calendar). "Add a date" reveals it; × removes it. */}
            <Labelled label={t('report.incidentDate')} optional>
              {draft.incidentDate ? (
                <>
                  <View style={local.pickerRow}>
                    <DateTimePicker
                      value={draft.incidentDate}
                      mode="date"
                      display="compact"
                      maximumDate={new Date()}
                      themeVariant="light"
                      accentColor={colors.primary}
                      onChange={(event, selectedDate) => {
                        if (event.type === 'set' && selectedDate) {
                          setField('incidentDate', selectedDate);
                        }
                      }}
                    />
                    <Pressable
                      onPress={() => setField('incidentDate', null)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('report.wizard.clearDate')}
                    >
                      <ClearIcon />
                    </Pressable>
                  </View>
                  <ToggleRow
                    label={t('report.approximate')}
                    value={draft.incidentDateApproximate}
                    onValueChange={(v) => setField('incidentDateApproximate', v)}
                  />
                </>
              ) : (
                <Pressable
                  style={theme.input}
                  onPress={() => setField('incidentDate', new Date())}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.muted }}>{t('report.wizard.selectDate')}</Text>
                </Pressable>
              )}
            </Labelled>

            {/* Incident time — same compact-picker pattern. */}
            <Labelled label={t('report.incidentTime')} optional>
              {draft.incidentTime ? (
                <>
                  <View style={local.pickerRow}>
                    <DateTimePicker
                      value={timeValue}
                      mode="time"
                      display="compact"
                      themeVariant="light"
                      accentColor={colors.primary}
                      onChange={(event, selected) => {
                        if (event.type === 'set' && selected) {
                          setTimeValue(selected);
                          setField('incidentTime', formatTime(selected));
                        }
                      }}
                    />
                    <Pressable
                      onPress={() => setField('incidentTime', '')}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('report.clearTime')}
                    >
                      <ClearIcon />
                    </Pressable>
                  </View>
                  <ToggleRow
                    label={t('report.approximate')}
                    value={draft.incidentTimeApproximate}
                    onValueChange={(v) => setField('incidentTimeApproximate', v)}
                  />
                </>
              ) : (
                <Pressable
                  style={theme.input}
                  onPress={() => {
                    const now = new Date();
                    setTimeValue(now);
                    setField('incidentTime', formatTime(now));
                  }}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.muted }}>{t('report.selectTime')}</Text>
                </Pressable>
              )}
            </Labelled>

            <Labelled label={t('report.locationName')} optional>
              <TextInput
                style={theme.input}
                value={draft.locationName}
                onChangeText={(v) => setField('locationName', v)}
                placeholder={t('report.locationNamePlaceholder')}
                placeholderTextColor={colors.muted}
              />
              {/* Alternative to typing: pick the spot on a map. We store only the
                  reverse-geocoded place name (+ district), never coordinates. */}
              <Pressable
                style={local.mapBtn}
                onPress={() => setShowMap(true)}
                accessibilityRole="button"
                accessibilityLabel={t('report.pickOnMap')}
              >
                <PinIconSmall color={colors.primary} />
                <Text style={local.mapBtnText}>{t('report.pickOnMap')}</Text>
              </Pressable>
            </Labelled>

            <View style={local.selectWrap}>
              <SelectField
                label={t('report.districtOptional')}
                placeholder={t('report.districtPlaceholder')}
                value={draft.district || null}
                options={districtOptions}
                onChange={(v) => setField('district', v)}
                sheetTitle={t('report.districtOptional')}
              />
              <Text style={theme.privacyNoteSmall}>{t('report.privacyNoteDistrict')}</Text>
            </View>
          </View>
        )}

        {/* ───────── Step 4 — Evidence & Safety ───────── */}
        {step === 4 && (
          <View>
            <Labelled label={t('report.evidencePrompt')} optional>
              <Text style={theme.privacyNoteSmall}>{t('report.privacyNoteEvidence')}</Text>
              <Pressable style={theme.btnSecondary} onPress={pickEvidence}>
                <Text style={theme.btnSecondaryText}>
                  {draft.evidenceFile
                    ? t('report.wizard.changeFile')
                    : t('report.wizard.chooseFile')}
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
            </Labelled>

            <Labelled label={t('report.evidenceDescribe')} optional>
              <TextInput
                style={[theme.input, theme.textarea]}
                value={draft.evidenceDescription}
                onChangeText={(v) => setField('evidenceDescription', v)}
                placeholder={t('report.evidenceDescribePlaceholder')}
                placeholderTextColor={colors.muted}
                multiline
              />
            </Labelled>

            <RadioGroup
              label={t('report.otherWitnesses')}
              options={TRISTATE.map((v) => ({ value: v, label: t(`triState.${v}`) }))}
              value={draft.otherWitnesses}
              onChange={(v) => setField('otherWitnesses', v)}
            />
            {draft.otherWitnesses === 'yes' ? (
              <Labelled label={t('report.witnessDetails')} optional>
                <TextInput
                  style={[theme.input, theme.textarea]}
                  value={draft.witnessDetails}
                  onChangeText={(v) => setField('witnessDetails', v)}
                  placeholder={t('report.witnessDetailsPlaceholder')}
                  placeholderTextColor={colors.muted}
                  multiline
                />
              </Labelled>
            ) : null}

            <RadioGroup
              label={t('report.immediateRisk')}
              options={TRISTATE.map((v) => ({ value: v, label: t(`triState.${v}`) }))}
              value={draft.immediateRisk}
              onChange={(v) => setField('immediateRisk', v)}
            />
            {draft.immediateRisk === 'yes' ? (
              <View style={local.dangerBox} accessibilityRole="alert">
                <Text style={local.dangerText}>{t('report.immediateRiskWarning')}</Text>
              </View>
            ) : null}

            <View style={local.selectWrap}>
              <SelectField
                label={t('report.previouslyReported')}
                placeholder={t('report.categoryPlaceholder')}
                value={draft.previouslyReported || null}
                options={PRIOR_REPORT_SOURCES.map((p) => ({
                  value: p,
                  label: t(`priorReport.${p}`),
                }))}
                onChange={(v) => setField('previouslyReported', v)}
                sheetTitle={t('report.previouslyReported')}
              />
            </View>
            {draft.previouslyReported && draft.previouslyReported !== 'none' ? (
              <Labelled label={t('report.previousReportDetails')} optional>
                <TextInput
                  style={theme.input}
                  value={draft.previousReportDetails}
                  onChangeText={(v) => setField('previousReportDetails', v)}
                  placeholder={t('report.previousReportDetailsPlaceholder')}
                  placeholderTextColor={colors.muted}
                />
              </Labelled>
            ) : null}

            <Labelled label={t('report.assistance')} hint={t('report.assistanceHint')}>
              <View style={local.chipRow}>
                {ASSISTANCE_TYPES.map((a) => {
                  const active = draft.assistanceRequested.includes(a);
                  return (
                    <Pressable
                      key={a}
                      onPress={() => toggleAssistance(a)}
                      style={[local.chip, active && local.chipActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[local.chipText, active && local.chipTextActive]}>
                        {t(`assistanceTypes.${a}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Labelled>

            <Labelled label={t('report.additionalInfo')} optional>
              <TextInput
                style={[theme.input, theme.textarea]}
                value={draft.additionalInformation}
                onChangeText={(v) => setField('additionalInformation', v)}
                placeholder={t('report.additionalInfoPlaceholder')}
                placeholderTextColor={colors.muted}
                multiline
              />
            </Labelled>
          </View>
        )}

        {/* ───────── Step 5 — Review & Submit ───────── */}
        {step === 5 && (
          <View>
            <Text style={local.reviewIntro}>{t('report.reviewIntro')}</Text>

            <ReviewSection title={t('report.steps.incident')} onEdit={() => goToStep(1)}>
              <ReviewRow label={t('report.reporterType')} value={label(draft.reporterType, (v) => t(`reporterTypes.${v}`))} />
              <ReviewRow
                label={t('report.category')}
                value={
                  draft.caseType === 'other' && draft.customCategory
                    ? draft.customCategory
                    : label(draft.caseType, (v) => t(`caseTypes.${v}`))
                }
              />
              <ReviewRow label={t('report.caseTitle')} value={draft.title || t('report.notProvided')} />
            </ReviewSection>

            <ReviewSection title={t('report.steps.details')} onEdit={() => goToStep(2)}>
              <ReviewRow label={t('report.whatHappened')} value={draft.description.trim()} />
              <ReviewRow label={t('report.peopleInvolved')} value={draft.peopleInvolved || t('report.notProvided')} />
              <ReviewRow label={t('report.victimInfo')} value={draft.victimInformation || t('report.notProvided')} />
            </ReviewSection>

            <ReviewSection title={t('report.steps.location')} onEdit={() => goToStep(3)}>
              <ReviewRow
                label={t('report.incidentDate')}
                value={
                  draft.incidentDate
                    ? `${draft.incidentDate.toLocaleDateString()}${draft.incidentDateApproximate ? ` (${t('report.approximate')})` : ''}`
                    : t('report.notProvided')
                }
              />
              <ReviewRow
                label={t('report.incidentTime')}
                value={
                  draft.incidentTime
                    ? `${draft.incidentTime}${draft.incidentTimeApproximate ? ` (${t('report.approximate')})` : ''}`
                    : t('report.notProvided')
                }
              />
              <ReviewRow label={t('report.locationName')} value={draft.locationName || t('report.notProvided')} />
              <ReviewRow label={t('report.districtOptional')} value={draft.district || t('report.notProvided')} />
            </ReviewSection>

            <ReviewSection title={t('report.steps.evidence')} onEdit={() => goToStep(4)}>
              <ReviewRow
                label={t('report.evidence')}
                value={draft.evidenceFile ? draft.evidenceFile.name : t('report.notProvided')}
              />
              <ReviewRow label={t('report.evidenceDescribe')} value={draft.evidenceDescription || t('report.notProvided')} />
              <ReviewRow label={t('report.otherWitnesses')} value={label(draft.otherWitnesses, (v) => t(`triState.${v}`))} />
              <ReviewRow label={t('report.immediateRisk')} value={label(draft.immediateRisk, (v) => t(`triState.${v}`))} />
              <ReviewRow label={t('report.previouslyReported')} value={label(draft.previouslyReported, (v) => t(`priorReport.${v}`))} />
              <ReviewRow
                label={t('report.assistance')}
                value={
                  draft.assistanceRequested.length
                    ? draft.assistanceRequested.map((a) => t(`assistanceTypes.${a}`)).join(', ')
                    : t('report.notProvided')
                }
              />
              <ReviewRow label={t('report.additionalInfo')} value={draft.additionalInformation || t('report.notProvided')} />
            </ReviewSection>

            {/* Anonymity confirmation. */}
            <Pressable
              style={local.confirmRow}
              onPress={() => {
                setConfirmed((c) => !c);
                setErrors((e) => ({ ...e, confirm: '' }));
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmed }}
            >
              <View style={[local.checkbox, confirmed && local.checkboxOn]}>
                {confirmed ? (
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                    <Path d="M5 13 l4 4 l10 -11" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                ) : null}
              </View>
              <Text style={local.confirmText}>{t('report.confirmAnonymous')}</Text>
            </Pressable>
            {errors.confirm ? <Text style={theme.fieldError}>{errors.confirm}</Text> : null}
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

        {/* Wizard navigation. Next on steps 1–4; step 5 has its own Submit. The
            header arrow handles going back — there is no text "Back" link. */}
        {step < TOTAL_STEPS ? (
          <Pressable style={theme.btnPrimary} onPress={goNext} accessibilityRole="button">
            <Text style={theme.btnPrimaryText}>{t('report.wizard.next')}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <LocationPickerModal
        visible={showMap}
        onClose={() => setShowMap(false)}
        onPicked={({ placeName, district }) => {
          if (placeName) setField('locationName', placeName);
          if (district) setField('district', district);
          setShowMap(false);
        }}
      />
    </View>
  );
}

const STEP_KEYS = ['incident', 'details', 'location', 'evidence', 'review'] as const;

// One line-icon per step, drawn in the given colour (state-dependent).
type StepIconProps = { color: string };
function IncidentIcon({ color }: StepIconProps) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M6 3 h8 l4 4 v14 H6 Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M9 12 h6 M9 16 h6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function DetailsIcon({ color }: StepIconProps) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M14 5 l4 4 L8 19 H4 v-4 Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}
function LocationIcon({ color }: StepIconProps) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21 C12 21 5 14.5 5 9 a7 7 0 0 1 14 0 C19 14.5 12 21 12 21 Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Circle cx={12} cy={9} r={2.5} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}
function EvidenceIcon({ color }: StepIconProps) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3 l7 3 v6 c0 4.5 -3 7 -7 9 c-4 -2 -7 -4.5 -7 -9 V6 Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}
function ReviewIcon({ color }: StepIconProps) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M5 13 l4 4 l10 -11" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
const STEP_ICONS = [IncidentIcon, DetailsIcon, LocationIcon, EvidenceIcon, ReviewIcon];

// The 5-step icon stepper. `step` is 1-based. A single continuous line runs
// BEHIND the nodes (so there is never a gap between line and circle), with a navy
// fill that ANIMATES from the first node toward the current one as you advance.
// Node icons stay a fixed size (no scale) — only the line fills.
function StepIndicator({ step }: { step: number }) {
  const { t } = useTranslation();
  const current = step - 1; // 0-based
  const target = current / (STEP_KEYS.length - 1); // 0..1 fill fraction

  const progress = useRef(new Animated.Value(target)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: target,
      duration: 350,
      useNativeDriver: false, // animating width %, which the native driver can't
    }).start();
  }, [target, progress]);

  return (
    <View style={local.stepper}>
      <View style={local.stepperRow}>
        {/* Continuous track behind the nodes: grey line + animated navy fill. It
            spans from the FIRST node's centre to the LAST node's centre. */}
        <View style={local.track}>
          <Animated.View
            style={[
              local.trackFill,
              {
                width: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
        {STEP_KEYS.map((key, i) => {
          const Icon = STEP_ICONS[i];
          const done = i < current;
          const active = i === current;
          const nodeStyle = done
            ? local.nodeDone
            : active
              ? local.nodeActive
              : local.nodeUpcoming;
          const iconColor = done ? colors.primaryText : active ? colors.primary : colors.muted;
          return (
            <View key={key} style={[local.node, nodeStyle]}>
              <Icon color={iconColor} />
            </View>
          );
        })}
      </View>
      <Text style={local.stepperLabel}>
        {t('report.stepOf', { current: step, total: TOTAL_STEPS })} ·{' '}
        {t(`report.steps.${STEP_KEYS[current]}`)}
      </Text>
    </View>
  );
}

// Resolve a stored value to its localised label; blank → em dash.
function label(value: string, resolve: (v: string) => string): string {
  return value ? resolve(value) : '—';
}

// --- Small presentational helpers kept in this file for cohesion ---

function Labelled({
  label,
  hint,
  required,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View style={local.field}>
      <Text style={theme.label}>
        {label}
        {required ? <Text style={local.required}> *</Text> : null}
        {optional ? <Text style={theme.optional}> ({t('common.optional')})</Text> : null}
      </Text>
      {children}
      {hint ? <Text style={theme.privacyNoteSmall}>{hint}</Text> : null}
    </View>
  );
}

// A vertical radio group (the improved single-select control).
function RadioGroup({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <View style={local.field}>
      <Text style={theme.label}>{label}</Text>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[local.radioRow, selected && local.radioRowSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <View style={[local.radioDot, selected && local.radioDotSelected]}>
              {selected ? <View style={local.radioDotInner} /> : null}
            </View>
            <Text style={local.radioLabel}>{opt.label}</Text>
          </Pressable>
        );
      })}
      {error ? <Text style={theme.fieldError}>{error}</Text> : null}
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={local.toggleRow}>
      <Text style={local.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} accessibilityLabel={label} />
    </View>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View style={local.reviewSection}>
      <View style={local.reviewHeader}>
        <Text style={local.reviewTitle}>{title}</Text>
        <Pressable onPress={onEdit} accessibilityRole="button">
          <Text style={theme.btnLinkText}>{t('report.editSection')}</Text>
        </Pressable>
      </View>
      {children}
    </View>
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
  screen: { flex: 1, backgroundColor: colors.background },
  // 5-step icon stepper.
  stepper: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: colors.background,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 34,
  },
  // Continuous line behind the nodes, spanning first-node centre → last-node
  // centre (17px inset each side = half a node). Grey track with a navy fill.
  track: {
    position: 'absolute',
    left: 17,
    right: 17,
    top: 15.5, // (34 - 3) / 2, vertically centred on the nodes
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  trackFill: { height: 3, borderRadius: 1.5, backgroundColor: colors.primary },
  node: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    zIndex: 1, // sit on top of the continuous track line
  },
  nodeDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  nodeActive: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  nodeUpcoming: { backgroundColor: colors.background, borderColor: colors.border },
  stepperLabel: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },

  body: { paddingHorizontal: 20, paddingBottom: 40 },
  anonBanner: {
    backgroundColor: colors.primaryTint,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  anonText: { fontSize: 14, color: colors.primary, fontWeight: '600', lineHeight: 20 },

  field: { marginBottom: 18 },
  required: { color: colors.danger, fontWeight: '700' },
  selectWrap: { marginBottom: 18 },

  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    marginBottom: 8,
  },
  radioRowSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  radioDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDotSelected: { borderColor: colors.primary },
  radioDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  radioLabel: { flex: 1, fontSize: 15, color: colors.text },

  // Row holding a compact date/time picker pill + a clear (×) button.
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // "Pick on map" button under the location field.
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  mapBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  toggleLabel: { fontSize: 14, color: colors.muted, fontWeight: '600' },

  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 12,
  },
  fileName: { flex: 1, color: colors.text },

  dangerBox: {
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: 12,
    marginTop: -8,
    marginBottom: 18,
  },
  dangerText: { fontSize: 14, color: '#7A1416', lineHeight: 20, fontWeight: '600' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  chip: {
    backgroundColor: colors.primaryTint,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  chipTextActive: { color: colors.primaryText },

  reviewIntro: { fontSize: 14, color: colors.muted, marginBottom: 16, lineHeight: 20 },
  reviewSection: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  reviewTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  reviewRow: { marginBottom: 10 },
  reviewLabel: { fontSize: 12, color: colors.muted, marginBottom: 2 },
  reviewValue: { fontSize: 15, color: colors.text, lineHeight: 20 },

  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, marginBottom: 4 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  confirmText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
});
