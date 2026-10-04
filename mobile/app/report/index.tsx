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
  Alert,
  Animated,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { usePreventScreenCapture } from 'expo-screen-capture';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useAudioRecorder, useAudioRecorderState, getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync, IOSOutputFormat, AudioQuality } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

import ReporterTopBar from '../../components/ReporterTopBar';
import SelectField, { type Option } from '../../components/SelectField';
import LocationPickerModal from '../../components/LocationPickerModal';
import ImageRedactorModal, { type RedactedImage } from '../../components/ImageRedactorModal';
import ReadAloudButton from '../../components/ReadAloudButton';
import { useReportForm } from '../../src/context/ReportFormContext';
import { submitReport, transcribeVoice } from '../../src/api/client';
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

// Voice is recorded in a format Google Speech-to-Text accepts directly, so the
// server can transcribe it without transcoding: LINEAR16 WAV on iOS, AMR_WB on
// Android — both 16 kHz mono, the sample rate Speech-to-Text recommends.
const VOICE_RECORDING = {
  extension: Platform.OS === 'ios' ? '.wav' : '.3gp',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 128000,
  android: {
    extension: '.3gp',
    outputFormat: 'amrwb' as const,
    audioEncoder: 'amr_wb' as const,
    sampleRate: 16000,
  },
  ios: {
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
};

// Filename + mime for the recorded voice file, matched to VOICE_RECORDING so the
// server detects the right Speech-to-Text encoding from the extension.
const VOICE_FILE =
  Platform.OS === 'ios'
    ? { name: 'voice_report.wav', mimeType: 'audio/wav' }
    : { name: 'voice_report.3gp', mimeType: 'audio/3gpp' };

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

// Turn a stored time label (e.g. "6:30 PM" or "18:30") back into a Date so the
// picker reopens on the time the reporter already chose, not on "now". If the
// label can't be parsed we keep the current picker value rather than jumping to
// a confident-but-wrong time.
function parseTime(label: string, fallback: Date): Date {
  const m = label.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
  if (!m) return fallback;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const meridiem = m[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return fallback;
  const d = new Date(fallback);
  d.setHours(hours, minutes, 0, 0);
  return d;
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

// Small calendar / clock glyphs to signal the field opens a picker.
function CalendarIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={5} width={16} height={16} rx={3} stroke={color} strokeWidth={1.8} />
      <Path d="M4 9 h16 M8 3 v4 M16 3 v4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function ClockIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={1.8} />
      <Path d="M12 8 v4 l3 2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
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
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, setField, reset } = useReportForm();

  // SAFETY: block screenshots / screen recording while a report is on screen. On
  // Android this also hides the app's content in the recents switcher, so a
  // narrative can't be captured off a shared or seized phone.
  usePreventScreenCapture();

  const [step, setStep] = useState(1);
  // Reset the scroll to the top whenever the step changes, so each new step opens
  // at its first question instead of inheriting the previous step's scroll offset
  // (which dropped the reporter at the bottom of the next page).
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The time picker works on a Date; we store the chosen time back to the draft
  // as a display string (the column is text). Seeded to a sensible default.
  const [timeValue, setTimeValue] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showMap, setShowMap] = useState(false);
  // Raw uri of a just-picked image awaiting the redaction editor (null = closed).
  const [redactUri, setRedactUri] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const audioRecorder = useAudioRecorder(VOICE_RECORDING);
  const audioState = useAudioRecorderState(audioRecorder);
  // True while the recorded voice report is being transcribed on the server.
  const [transcribing, setTranscribing] = useState(false);

  const startRecording = async () => {
    try {
      setErrors((e) => ({ ...e, evidence: '' }));
      // Only call request if the OS can still show the dialog. Once the mic was
      // denied, Android (and iOS) return "denied" WITHOUT re-prompting — so a bare
      // requestRecordingPermissionsAsync() silently fails and looks like "it never
      // asked". In that case we send the reporter to Settings to grant it there.
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) {
        perm = await requestRecordingPermissionsAsync();
      }
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          Alert.alert(
            t('report.wizard.micPermissionTitle'),
            t('report.wizard.micPermissionSettings'),
            [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('report.wizard.openSettings'), onPress: () => Linking.openSettings() },
            ],
          );
        }
        setErrors((e) => ({ ...e, evidence: t('report.wizard.micPermissionRequired') }));
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (err) {
      setErrors((e) => ({ ...e, evidence: t('report.wizard.recordStartFailed') }));
    }
  };

  const stopRecording = async () => {
    try {
      await audioRecorder.stop();
      if (audioRecorder.uri) {
        const fileInfo = await FileSystem.getInfoAsync(audioRecorder.uri);
        const size = fileInfo.exists ? fileInfo.size : 0;

        if (size > MAX_EVIDENCE_BYTES) {
          setErrors((e) => ({ ...e, evidence: t('report.wizard.evidenceTooBig') }));
          return;
        }

        const voiceFile = {
          uri: audioRecorder.uri,
          name: VOICE_FILE.name,
          mimeType: VOICE_FILE.mimeType,
          size,
          lastModified: Date.now(),
        };
        setField('evidenceFile', voiceFile);

        // Best-effort transcription: turn the spoken report into editable text in
        // the narrative field so staff get searchable text. NEVER blocks — the
        // audio is kept regardless, and any failure is silent (we keep the voice).
        await transcribeVoiceReport(voiceFile);
      }
    } catch (err) {
      setErrors((e) => ({ ...e, evidence: t('report.wizard.recordStopFailed') }));
    }
  };

  // Send the recorded audio to the server for transcription and, on success,
  // append the text to the "What happened?" narrative (the reporter can edit it).
  const transcribeVoiceReport = async (voiceFile: {
    uri: string;
    name: string;
    mimeType: string;
  }) => {
    setTranscribing(true);
    try {
      const res = await transcribeVoice(voiceFile, i18n.language);
      const text = res.data?.data?.transcript?.trim();
      if (text) {
        setField(
          'description',
          draft.description.trim() ? `${draft.description.trim()}\n\n${text}` : text,
        );
      }
    } catch {
      // Transcription is optional — never surface a blocking error, and never log
      // (the audio/transcript are case content). The voice file is already saved.
    } finally {
      setTranscribing(false);
    }
  };

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
    // District is mandatory: staff use it to route the case to a local
    // organisation, and the server/database now require it too.
    if (s === 3) {
      if (!draft.district) next.district = t('report.errors.districtRequired');
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

  // ACCESSIBILITY: build a spoken version of the CURRENT step's questions, so a
  // low-literacy or visually-impaired reporter can hear what to fill in. Uses the
  // same i18n strings shown on screen. Built lazily (getter) so it always matches
  // the visible step. Read fully on-device — nothing is sent anywhere.
  const buildSpokenStep = (): string => {
    const parts: string[] = [t('report.anonymousBanner')];
    if (step === 1) {
      parts.push(t('report.reporterType'), t('report.category'), t('report.caseTitle'));
    } else if (step === 2) {
      parts.push(t('report.whatHappened'), t('report.peopleInvolved'), t('report.victimInfo'));
    } else if (step === 3) {
      parts.push(t('report.incidentDate'), t('report.incidentTime'), t('report.locationName'));
    } else if (step === 4) {
      parts.push(t('report.evidence'), t('report.wizard.recordVoice', t('report.evidence')));
    } else if (step === 5) {
      parts.push(t('report.reviewTitle', t('report.title')));
    }
    return parts.filter(Boolean).join('. ');
  };

  // ---- Evidence picker (step 4) ----
  // ANONYMITY: a photo picked from the gallery carries EXIF metadata — most
  // dangerously embedded GPS coordinates and a capture timestamp, but also the
  // camera/device model. Any of these can locate or identify the reporter, which
  // would defeat "anonymous by construction". We re-encode every picked image to
  // a fresh JPEG before it ever leaves the device: re-encoding writes a new file
  // with NO metadata block, and we also drop the original filename (which itself
  // can be identifying, e.g. "IMG_from_<name>.jpg"). PDFs/audio are not images,
  // so they skip this path — and our own voice recorder never writes GPS.
  const stripImageMetadata = async (
    asset: { uri: string; name?: string; mimeType?: string; size?: number },
  ) => {
    // Passing no actions still re-encodes the pixels to a clean JPEG.
    const cleaned = await ImageManipulator.manipulateAsync(asset.uri, [], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const info = await FileSystem.getInfoAsync(cleaned.uri);
    return {
      uri: cleaned.uri,
      name: 'evidence.jpg',
      mimeType: 'image/jpeg',
      size: info.exists ? info.size : asset.size ?? 0,
      lastModified: Date.now(),
    };
  };

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

    // Images open the redaction editor first, so the reporter can cover faces,
    // plates and name boards before the photo is stored. The editor bakes the
    // boxes in AND re-encodes (dropping EXIF/GPS); skipping it still strips
    // metadata via the plain path below.
    const isImage = mime.startsWith('image/') || /\.(jpe?g|png|webp)$/.test(nameLower);
    if (isImage) {
      setRedactUri(asset.uri);
      return;
    }

    setField('evidenceFile', asset);
  };

  // The editor always returns a clean, flattened, metadata-free JPEG — whether
  // the reporter covered areas ("Use photo") or not ("Skip"). We only need to
  // enforce the size cap before storing it in the draft.
  const applyRedaction = (result: RedactedImage) => {
    setRedactUri(null);
    if (result.size > MAX_EVIDENCE_BYTES) {
      setErrors((e) => ({ ...e, evidence: t('report.wizard.evidenceTooBig') }));
      return;
    }
    setField('evidenceFile', result);
  };

  // Reporter backed out of the editor entirely — attach no image.
  const cancelRedaction = () => setRedactUri(null);

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
    if (!validateStep(3)) {
      setStep(3);
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
  const districtOptions: Option[] = DISTRICTS.map((d) => ({ value: d, label: t(`districts.${d}`, d) }));

  return (
    <View style={local.screen}>
      {/* The header arrow steps back through the wizard (and leaves the form at
          step 1) — a single, clear back affordance, so no text "Back" link. */}
      <ReporterTopBar title={t('report.title')} onBack={goBack} />

      {/* Progress: a 5-step icon stepper (completed / current / upcoming). */}
      <StepIndicator step={step} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[local.body, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Anonymity reassurance, shown on every step. */}
        <View style={local.anonBanner}>
          <Text style={local.anonText}>{t('report.anonymousBanner')}</Text>
        </View>

        {/* Read the current step's questions aloud (on-device TTS) for low-literacy
            or visually-impaired reporters. Getter is re-evaluated per tap so it
            always speaks the step the user is on. */}
        <ReadAloudButton getText={buildSpokenStep} style={local.readAloud} />

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
          // Tapping anywhere on the step that isn't the picker itself (or another
          // control) collapses the inline date/time pickers — the spinner has no
          // built-in "done", so an outside tap is how the reporter dismisses it.
          // accessible={false} keeps this wrapper invisible to screen readers.
          <Pressable
            accessible={false}
            onPress={() => {
              setShowDatePicker(false);
              setShowTimePicker(false);
            }}
          >
            {/* Incident date — tap the field to reveal a compact date wheel
                (defaults to today). × clears it. */}
            <Labelled label={t('report.incidentDate')} optional>
              <View style={local.pickerRow}>
                <Pressable
                  style={[theme.input, local.fieldFlex]}
                  onPress={() => {
                    setShowTimePicker(false); // one picker open at a time
                    setShowDatePicker((v) => !v);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={{ color: draft.incidentDate ? colors.text : colors.muted }}>
                    {draft.incidentDate
                      ? draft.incidentDate.toLocaleDateString()
                      : t('report.wizard.selectDate')}
                  </Text>
                  <CalendarIcon color={colors.muted} />
                </Pressable>
                {draft.incidentDate ? (
                  <Pressable
                    onPress={() => {
                      setField('incidentDate', null);
                      setShowDatePicker(false);
                    }}
                    style={local.clearBtn}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('report.wizard.clearDate')}
                  >
                    <ClearIcon />
                  </Pressable>
                ) : null}
              </View>
              {showDatePicker ? (
                // No bordered wrapper on Android: there the picker is a native
                // MODAL dialog and renders null inline, so a wrapping box would
                // just show as an empty line/oval under the field. iOS renders the
                // calendar inline, so it keeps the bordered host.
                <View style={Platform.OS === 'android' ? undefined : local.inlinePicker}>
                  <DateTimePicker
                    value={draft.incidentDate ?? new Date()}
                    mode="date"
                    // A simple month calendar grid (tap a day) instead of the
                    // scroll wheel: iOS "inline", Android "calendar".
                    display={Platform.select({ ios: 'inline', android: 'calendar', default: 'default' })}
                    maximumDate={new Date()}
                    themeVariant="light"
                    accentColor={colors.primary}
                    // v9 renamed `onChange` → `onValueChange` (the old prop logs a
                    // deprecation warning).
                    onValueChange={(_event, selectedDate) => {
                      if (selectedDate) setField('incidentDate', selectedDate);
                      // Android: the dialog returns a value ONCE on "OK"; close it
                      // here or the open-effect re-fires on the value change and
                      // immediately reopens it (and it would stay open over other
                      // fields). iOS is inline — the outside-tap handler dismisses it.
                      if (Platform.OS === 'android') setShowDatePicker(false);
                    }}
                    // Android fires this (not onValueChange) when the dialog is
                    // cancelled/back-dismissed — close so it doesn't reopen.
                    onDismiss={() => setShowDatePicker(false)}
                  />
                </View>
              ) : null}
              {draft.incidentDate ? (
                <ToggleRow
                  label={t('report.approximate')}
                  value={draft.incidentDateApproximate}
                  onValueChange={(v) => setField('incidentDateApproximate', v)}
                />
              ) : null}
            </Labelled>

            {/* Incident time — tap the field to reveal a clock (defaults to now). */}
            <Labelled label={t('report.incidentTime')} optional>
              <View style={local.pickerRow}>
                <Pressable
                  style={[theme.input, local.fieldFlex]}
                  onPress={() => {
                    setShowDatePicker(false); // one picker open at a time
                    // Seed the clock with the time already chosen (if any) so
                    // reopening the picker shows that time, not a stale default.
                    if (!showTimePicker && draft.incidentTime) {
                      setTimeValue(parseTime(draft.incidentTime, timeValue));
                    }
                    setShowTimePicker((v) => !v);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={{ color: draft.incidentTime ? colors.text : colors.muted }}>
                    {draft.incidentTime || t('report.selectTime')}
                  </Text>
                  <ClockIcon color={colors.muted} />
                </Pressable>
                {draft.incidentTime ? (
                  <Pressable
                    onPress={() => {
                      setField('incidentTime', '');
                      setShowTimePicker(false);
                    }}
                    style={local.clearBtn}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('report.clearTime')}
                  >
                    <ClearIcon />
                  </Pressable>
                ) : null}
              </View>
              {showTimePicker ? (
                // See the date picker above: Android is a modal dialog (null inline),
                // so it gets no bordered host; iOS keeps the inline spinner.
                <View style={Platform.OS === 'android' ? undefined : local.inlinePicker}>
                  <DateTimePicker
                    value={timeValue}
                    mode="time"
                    display={Platform.select({ ios: 'spinner', android: 'default', default: 'spinner' })}
                    themeVariant="light"
                    accentColor={colors.primary}
                    // v9 renamed `onChange` → `onValueChange`. On iOS the spinner stays
                    // open so the reporter can keep rolling; we mirror each change.
                    onValueChange={(_event, selected) => {
                      if (selected) {
                        setTimeValue(selected);
                        setField('incidentTime', formatTime(selected));
                      }
                      // Android: dialog returns once on "OK" — close it so it doesn't
                      // reopen on the value change or linger over other fields.
                      if (Platform.OS === 'android') setShowTimePicker(false);
                    }}
                    // Android cancel/back-dismiss — close so it doesn't reopen.
                    onDismiss={() => setShowTimePicker(false)}
                  />
                </View>
              ) : null}
              {draft.incidentTime ? (
                <ToggleRow
                  label={t('report.approximate')}
                  value={draft.incidentTimeApproximate}
                  onValueChange={(v) => setField('incidentTimeApproximate', v)}
                />
              ) : null}
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
                label={t('report.district')}
                required
                placeholder={t('report.districtPlaceholder')}
                value={draft.district || null}
                options={districtOptions}
                onChange={(v) => {
                  setField('district', v);
                  setErrors((e) => ({ ...e, district: '' }));
                }}
                sheetTitle={t('report.district')}
              />
              {errors.district ? <Text style={theme.fieldError}>{errors.district}</Text> : null}
              <Text style={theme.privacyNoteSmall}>{t('report.privacyNoteDistrict')}</Text>
            </View>
          </Pressable>
        )}

        {/* ───────── Step 4 — Evidence & Safety ───────── */}
        {step === 4 && (
          <View>
            <Labelled label={t('report.evidencePrompt')} optional>
              <Text style={theme.privacyNoteSmall}>{t('report.privacyNoteEvidence')}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Pressable style={[theme.btnSecondary, { flex: 1, marginTop: 0 }]} onPress={pickEvidence}>
                  <Text style={theme.btnSecondaryText}>
                    {draft.evidenceFile
                      ? t('report.wizard.changeFile')
                      : t('report.wizard.chooseFile')}
                  </Text>
                </Pressable>
                {!audioState.isRecording ? (
                  <Pressable style={[theme.btnSecondary, { flex: 1, marginTop: 0 }]} onPress={startRecording}>
                    <Text style={theme.btnSecondaryText}>{t('report.wizard.recordAudio')}</Text>
                  </Pressable>
                ) : (
                  <Pressable style={[theme.btnSecondary, { flex: 1, marginTop: 0, borderColor: '#d32f2f', borderWidth: 1 }]} onPress={stopRecording}>
                    <Text style={[theme.btnSecondaryText, { color: '#d32f2f' }]}>
                      {t('report.wizard.stopRecording')}
                    </Text>
                  </Pressable>
                )}
              </View>
              {audioState.isRecording && (
                <Text style={[theme.privacyNoteSmall, { color: '#d32f2f', marginTop: 8 }]}>
                  {t('report.wizard.recordingActive')} {Math.floor(audioState.durationMillis / 1000)}s
                </Text>
              )}
              {transcribing && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={theme.privacyNoteSmall}>{t('report.wizard.transcribing')}</Text>
                </View>
              )}
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
              <ReviewRow label={t('report.districtOptional')} value={draft.district ? t(`districts.${draft.district}`, draft.district) : t('report.notProvided')} />
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
            header back arrow steps to the previous step (see onBack → goBack). */}
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

      <ImageRedactorModal
        visible={redactUri != null}
        imageUri={redactUri}
        onCancel={cancelRedaction}
        onApply={applyRedaction}
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
  readAloud: { alignSelf: 'flex-start', marginBottom: 16 },

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

  // Row: a tappable date/time field (flex) + a clear (×) button.
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // The tappable field shows the value on the left and a calendar/clock on the right.
  fieldFlex: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clearBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  // Container for the revealed inline calendar / clock.
  inlinePicker: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 4,
    alignItems: 'center',
    backgroundColor: colors.background,
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
