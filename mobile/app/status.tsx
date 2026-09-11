/**
 * JusticeNow (mobile) — Check case status.
 *
 * An anonymous reporter enters the reference code they were given at submission
 * (JN-XXXXXXXX) and sees their case's current status plus any reporter-visible
 * notes staff have added. This screen never authenticates and never stores the
 * code — it lives in component state only, and Quick Exit (mounted globally)
 * clears everything on the way out.
 *
 * PRIVACY / NO-ORACLE:
 *  - We call the TOKENLESS reporter `api` via fetchCaseStatus — reporters are
 *    anonymous, so no Authorization header is ever attached.
 *  - The server returns an IDENTICAL generic 404 for "not found" and "rate
 *    limited". We therefore treat ANY 4xx response the same way — the single
 *    generic `status.notFound` message — and never try to tell them apart.
 *  - Only a transport failure (no response at all) shows the retryable
 *    ErrorState; a 4xx is a definitive answer, not a retryable error.
 *  - We never log the code, the response, or any case content.
 *
 * All strings go through t(); all styling comes from theme tokens.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

import Svg, { Path, Rect } from 'react-native-svg';
import ReporterTopBar from '../components/ReporterTopBar';
import ErrorState from '../components/ErrorState';
import QrScannerModal from '../components/QrScannerModal';
import { fetchCaseStatus } from '../src/api/client';
import type { CaseStatus } from '../src/api/client';
import { colors, styles as theme } from '../src/theme';

// A small QR glyph for the "Scan QR code" button.
function QrGlyph({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={7} height={7} rx={1.5} stroke={color} strokeWidth={1.8} />
      <Rect x={14} y={3} width={7} height={7} rx={1.5} stroke={color} strokeWidth={1.8} />
      <Rect x={3} y={14} width={7} height={7} rx={1.5} stroke={color} strokeWidth={1.8} />
      <Path d="M14 14 h3 v3 M20 14 v7 M14 20 h3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// Distinguishes the two failure modes we render differently: a definitive
// generic 4xx answer (show notFound, no retry) versus a transport failure
// (show ErrorState with retry). Anything that is not a network error is treated
// as "notFound" so we never build an enumeration oracle out of status codes.
type LookupError = 'notFound' | 'network';

// The reference-code shape, mirroring utils/referenceCode.js: the 'JN-' prefix
// plus 8 chars from an UNAMBIGUOUS alphabet (no O/0, I/1 or L). Validating the
// SHAPE here is NOT an oracle — the format is public and reveals nothing about
// which codes exist. We accept a missing dash and any case, then normalise.
const CODE_RE = /^JN-?([A-HJ-NP-Z2-9]{8})$/;

function normaliseCode(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  const m = cleaned.match(CODE_RE);
  return m ? `JN-${m[1]}` : null;
}

export default function CheckStatus() {
  const { t } = useTranslation();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CaseStatus | null>(null);
  const [error, setError] = useState<LookupError | null>(null);
  // Client-side format error, shown UNDER the field, distinct from the generic
  // server not-found. A malformed code never reaches the server.
  const [formatError, setFormatError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const trimmedCode = code.trim();
  const canSubmit = trimmedCode.length > 0 && !loading;

  // Validate + look up a code. Shared by the manual button and the QR scanner so
  // both go through the SAME format check and no-oracle handling.
  const runLookup = async (rawCode: string) => {
    // Validate the SHAPE first. If it doesn't look like a JN reference code we
    // tell the reporter it's not a valid code (a typo / wrong QR), rather than
    // hitting the server and returning the generic "no case found".
    const normalised = normaliseCode(rawCode);
    if (!normalised) {
      setResult(null);
      setError(null);
      setFormatError(t('status.invalidFormat'));
      return;
    }

    setFormatError(null);
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetchCaseStatus(normalised);
      setResult(res.data.data);
    } catch (err) {
      // Do NOT log the error — it can carry the reference code in the URL.
      // A response with any status means the server answered: per the no-oracle
      // rule that answer is the single generic not-found. Only the total
      // absence of a response is a retryable network problem.
      if (axios.isAxiosError(err) && !err.response) {
        setError('network');
      } else {
        setError('notFound');
      }
    } finally {
      setLoading(false);
    }
  };

  const lookup = () => {
    if (!canSubmit) return;
    runLookup(code);
  };

  // A scanned QR: close the camera, show the decoded code in the field, and look
  // it up. If the QR held something that isn't a JN code, the shared validation
  // shows the invalid-format message.
  const onScanned = (data: string) => {
    setScanning(false);
    const normalised = normaliseCode(data);
    setCode(normalised ?? data.trim());
    runLookup(data);
  };

  return (
    <View style={local.screen}>
      <ReporterTopBar title={t('status.title')} />

      <ScrollView contentContainerStyle={theme.page} keyboardShouldPersistTaps="handled">
        {/* Reference-code entry. autoCapitalize=characters because codes are
            upper-case (JN-XXXXXXXX); the server also uppercases defensively. */}
        <Text style={theme.label} nativeID="statusCodeLabel">
          {t('status.codeLabel')}
        </Text>
        <TextInput
          style={[theme.input, formatError ? local.inputError : null]}
          value={code}
          onChangeText={(v) => {
            setCode(v);
            if (formatError) setFormatError(null);
          }}
          placeholder={t('status.codePlaceholder')}
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="search"
          onSubmitEditing={lookup}
          editable={!loading}
          accessibilityLabel={t('status.codeLabel')}
          accessibilityLabelledBy="statusCodeLabel"
        />
        {formatError ? (
          <Text style={theme.fieldError} accessibilityRole="alert">
            {formatError}
          </Text>
        ) : null}

        <Pressable
          onPress={lookup}
          disabled={!canSubmit}
          style={[theme.btnPrimary, !canSubmit && theme.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={loading ? t('status.looking') : t('status.lookup')}
          accessibilityState={{ disabled: !canSubmit, busy: loading }}
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={theme.btnPrimaryText}>{t('status.lookup')}</Text>
          )}
        </Pressable>

        {/* "or" divider + Scan QR alternative. Same lookup, no typing. */}
        <View style={local.orRow}>
          <View style={local.orLine} />
          <Text style={local.orText}>{t('status.or')}</Text>
          <View style={local.orLine} />
        </View>
        <Pressable
          onPress={() => setScanning(true)}
          disabled={loading}
          style={[local.scanBtn, loading && theme.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t('status.scanQr')}
        >
          <QrGlyph color={colors.primary} />
          <Text style={local.scanBtnText}>{t('status.scanQr')}</Text>
        </Pressable>

        {/* Generic not-found (also shown for rate-limited — indistinguishable
            by design). Announced to screen readers via role=alert. */}
        {error === 'notFound' ? (
          <View style={local.notFoundBox} accessibilityRole="alert">
            <Text style={local.notFoundText}>{t('status.notFound')}</Text>
          </View>
        ) : null}

        {/* Transport failure only — offer a retry. */}
        {error === 'network' ? (
          <View style={local.errorWrap}>
            <ErrorState message={t('status.networkError')} onRetry={lookup} />
          </View>
        ) : null}

        {result ? <StatusCard data={result} /> : null}
      </ScrollView>

      <QrScannerModal
        visible={scanning}
        onScanned={onScanned}
        onClose={() => setScanning(false)}
      />
    </View>
  );
}

/**
 * Presentational card for a found case. Renders ONLY the safe projection the
 * server sends (status, type, district, dates, reporter-visible notes) — the
 * type `CaseStatus` has no narrative/evidence field, so none can leak here.
 */
function StatusCard({ data }: { data: CaseStatus }) {
  const { t } = useTranslation();

  return (
    <View style={local.card}>
      {/* Status is shown as the ONE permitted solid-orange chip on the
          case-tracking screen (10% accent). Text on #F18501 MUST be
          on-secondary #3D2200 (white/light on orange fails WCAG AA). */}
      <View style={local.statusRow}>
        <Text style={local.rowLabel}>{t('status.statusLabel')}</Text>
        <View style={local.statusChip}>
          <Text style={local.statusChipText}>{t(`statuses.${data.status}`)}</Text>
        </View>
      </View>
      {data.title ? <Row label={t('report.caseTitle')} value={data.title} /> : null}
      <Row
        label={t('status.caseTypeLabel')}
        value={
          data.case_type === 'other' && data.custom_category
            ? data.custom_category
            : t(`caseTypes.${data.case_type}`)
        }
      />
      {data.district ? <Row label={t('status.districtLabel')} value={data.district} /> : null}
      {data.location_name ? (
        <Row label={t('report.locationName')} value={data.location_name} />
      ) : null}
      {data.incident_date ? (
        <Row label={t('status.incidentLabel')} value={formatDate(data.incident_date)} />
      ) : null}
      <Row label={t('status.submittedLabel')} value={formatDate(data.created_at)} />

      {/* "What happens next" — the case journey with the current step highlighted.
          Gives an anonymous reporter (who only holds a reference code) confidence
          that a real process is moving. */}
      <StatusTimeline status={data.status} />

      <Text style={local.notesTitle}>{t('status.notesTitle')}</Text>
      {data.notes.length === 0 ? (
        <Text style={local.noNotes}>{t('status.noNotes')}</Text>
      ) : (
        <View>
          {data.notes.map((n, i) => (
            <View key={`${n.created_at}-${i}`} style={local.noteItem}>
              <Text style={local.noteText}>{n.note}</Text>
              <Text style={local.noteDate}>{formatDate(n.created_at)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// The reporter-visible case journey. Linear stepper over the state machine; the
// current status is highlighted, earlier steps are marked done, later steps are
// muted "upcoming". A case can skip 'referred' (e.g. closed early) — showing it
// as completed is an acceptable simplification for a reassurance timeline.
const JOURNEY = ['received', 'under_review', 'referred', 'closed'];

function StatusTimeline({ status }: { status: string }) {
  const { t } = useTranslation();
  const currentIndex = JOURNEY.indexOf(status);
  return (
    <View style={local.timeline}>
      <Text style={local.timelineHeading}>{t('status.journey.heading')}</Text>
      {JOURNEY.map((s, i) => {
        const done = currentIndex >= 0 && i < currentIndex;
        const active = i === currentIndex;
        const future = currentIndex >= 0 && i > currentIndex;
        const isLast = i === JOURNEY.length - 1;
        return (
          <View key={s} style={local.step}>
            <View style={local.markerCol}>
              <View style={[local.dot, (done || active) && local.dotFilled]}>
                {done ? <Text style={local.dotCheck}>✓</Text> : null}
                {active ? <View style={local.dotInner} /> : null}
              </View>
              {!isLast ? <View style={[local.connector, done && local.connectorDone]} /> : null}
            </View>
            <View style={local.stepBody}>
              <Text
                style={[
                  local.stepTitle,
                  active && local.stepTitleActive,
                  future && local.stepMuted,
                ]}
              >
                {t(`statuses.${s}`)}
              </Text>
              <Text style={[local.stepDesc, future && local.stepMuted]}>
                {t(`status.journey.${s}`)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Row({
  label,
  value,
  emphasise,
}: {
  label: string;
  value: string;
  emphasise?: boolean;
}) {
  return (
    <View style={local.row}>
      <Text style={local.rowLabel}>{label}</Text>
      <Text style={[local.rowValue, emphasise && local.rowValueEmphasis]}>{value}</Text>
    </View>
  );
}

// Format an ISO date/timestamp for display. Falls back to the raw string if the
// value is unparseable so we never crash on unexpected input.
function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const local = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inputError: { borderColor: colors.danger },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 14 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontSize: 13, color: colors.muted },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  scanBtnText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  notFoundBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryTint,
  },
  notFoundText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  errorWrap: {
    marginTop: 16,
  },
  card: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryTint,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryTint,
  },
  statusChip: {
    backgroundColor: colors.secondary,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  statusChipText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.onSecondary,
  },
  rowLabel: {
    fontSize: 14,
    color: colors.muted,
    flexShrink: 0,
    marginRight: 12,
  },
  rowValue: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  rowValueEmphasis: {
    fontWeight: '800',
    color: colors.primary,
  },
  // "What happens next" timeline.
  timeline: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.primaryTint,
  },
  timelineHeading: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 14 },
  step: { flexDirection: 'row' },
  markerCol: { width: 24, alignItems: 'center' },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotCheck: { color: '#ffffff', fontSize: 12, fontWeight: '800', lineHeight: 14 },
  dotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ffffff' },
  connector: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
  connectorDone: { backgroundColor: colors.primary },
  stepBody: { flex: 1, paddingLeft: 12, paddingBottom: 18 },
  stepTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  stepTitleActive: { color: colors.primary },
  stepDesc: { fontSize: 13, color: colors.muted, marginTop: 3, lineHeight: 18 },
  stepMuted: { color: '#9aa7ae' },

  notesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  noNotes: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  noteItem: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.primaryTint,
  },
  noteText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  noteDate: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
});
