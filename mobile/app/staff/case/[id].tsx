/**
 * JusticeNow (mobile) — Staff case-detail screen (route /staff/case/:id).
 *
 * The full staff view of a single case: narrative, evidence (via a short-lived
 * signed URL), the notes timeline (internal + reporter-visible), the add-note
 * form, org assignment, and the status-transition actions the current role may
 * take. Reached from the Reports tab (see reports.tsx).
 *
 * AUTH: every call here goes through the token-bearing staffApi. A 401 means the
 * in-memory token has expired (we never persist it) — we log out and bounce to
 * /staff/login, the same leave-no-trace path the reports list uses.
 *
 * PRIVACY: this is a staff-only surface, so it may DISPLAY the narrative, notes
 * and evidence — but it must NEVER log any of them, and it must never persist
 * case content to the device. The evidence link is intentionally short-lived; if
 * it expires the staffer refreshes the case to mint a fresh one server-side.
 *
 * All strings go through t(); all styling comes from theme tokens.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import axios from 'axios';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SelectField from '../../../components/SelectField';
import type { Option } from '../../../components/SelectField';
import ErrorState from '../../../components/ErrorState';
import BackButton from '../../../components/BackButton';
import {
  fetchCaseDetail,
  addCaseNote,
  changeCaseStatus,
  assignCase,
  fetchOrganisations,
} from '../../../src/api/client';
import type { CaseDetail, CaseNote, Organisation } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { colors, styles as theme } from '../../../src/theme';

export default function StaffCaseDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<'notFound' | 'network' | null>(null);

  // Send the user back to login after clearing the dead session (same 401 path
  // as reports.tsx). Tokens are never persisted; a 401 means it has expired.
  const goToLogin = useCallback(() => {
    logout();
    router.replace('/staff/login');
  }, [logout, router]);

  // True when an error is a 401 → drop the session and redirect. Returns whether
  // it handled the error so callers can stop early.
  const handledAuthError = useCallback(
    (err: unknown): boolean => {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        goToLogin();
        return true;
      }
      return false;
    },
    [goToLogin],
  );

  const load = useCallback(async () => {
    if (!id) return;
    setFailed(null);
    try {
      // Fetch the case and the (public) org list in parallel. Orgs power the
      // assign SelectField; the org endpoint is tokenless/public by design.
      const [caseRes, orgRes] = await Promise.all([
        fetchCaseDetail(id),
        fetchOrganisations(),
      ]);
      setCaseData(caseRes.data.data);
      setOrgs(orgRes.data.data);
    } catch (err) {
      // Never log err — a case payload could carry narrative/notes.
      if (handledAuthError(err)) return;
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setFailed('notFound');
        return;
      }
      setFailed('network');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, handledAuthError]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  if (loading && !refreshing) {
    return (
      <View style={local.centre}>
        <ActivityIndicator
          color={colors.primary}
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  }

  if (failed) {
    return (
      <View style={local.centre}>
        <ErrorState
          message={
            failed === 'notFound'
              ? t('caseDetail.notFound')
              : t('caseDetail.networkError')
          }
          onRetry={load}
        />
      </View>
    );
  }

  if (!caseData) {
    return null;
  }

  return (
    <ScrollView
      style={[local.screen, { paddingTop: insets.top }]}
      contentContainerStyle={local.body}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <Header caseData={caseData} onBack={() => router.back()} />

      <MetadataCard caseData={caseData} />

      <NarrativeCard description={caseData.description} />

      <ReportDetailsCard caseData={caseData} />

      <EvidenceCard caseData={caseData} />

      <AssignCard
        caseData={caseData}
        orgs={orgs}
        onDone={load}
        onAuthError={handledAuthError}
      />

      <NotesCard caseData={caseData} onDone={load} onAuthError={handledAuthError} />

      <StatusActionsCard
        caseData={caseData}
        onDone={load}
        onAuthError={handledAuthError}
      />
    </ScrollView>
  );
}

/** Header: reference code (mono) + status badge + a Back control. */
function Header({ caseData, onBack }: { caseData: CaseDetail; onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={local.header}>
      <BackButton onPress={onBack} label={t('caseDetail.back')} />
      <View style={local.headerRow}>
        <Text style={local.reference}>{caseData.reference_code}</Text>
        <View style={local.badge}>
          <Text style={local.badgeText}>{t(`statuses.${caseData.status}`)}</Text>
        </View>
      </View>
      {caseData.title ? <Text style={local.caseTitle}>{caseData.title}</Text> : null}
      {/* Priority signal: an immediate-risk = "yes" case is flagged so staff can
          triage it first. 'not_sure' is a softer amber note. */}
      {caseData.immediate_risk === 'yes' || caseData.immediate_risk === 'not_sure' ? (
        <View
          style={[
            local.riskBadge,
            caseData.immediate_risk === 'yes' ? local.riskHigh : local.riskMed,
          ]}
        >
          <Text
            style={[
              local.riskText,
              caseData.immediate_risk === 'yes' ? local.riskTextHigh : local.riskTextMed,
            ]}
          >
            {t('caseDetail.riskLabel')}: {t(`triState.${caseData.immediate_risk}`)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function MetadataCard({ caseData }: { caseData: CaseDetail }) {
  const { t } = useTranslation();
  const incidentDate = caseData.incident_date
    ? `${formatDate(caseData.incident_date)}${caseData.incident_date_approximate ? ` (${t('report.approximate')})` : ''}`
    : t('caseDetail.notProvided');
  const incidentTime = caseData.incident_time
    ? `${caseData.incident_time}${caseData.incident_time_approximate ? ` (${t('report.approximate')})` : ''}`
    : null;
  return (
    <View style={local.card}>
      <Text style={local.cardTitle}>{t('caseDetail.metadataTitle')}</Text>
      {caseData.reporter_type ? (
        <MetaRow
          label={t('report.reporterType')}
          value={t(`reporterTypes.${caseData.reporter_type}`)}
        />
      ) : null}
      <MetaRow
        label={t('caseDetail.caseTypeLabel')}
        value={
          caseData.case_type === 'other' && caseData.custom_category
            ? caseData.custom_category
            : t(`caseTypes.${caseData.case_type}`)
        }
      />
      <OptionalRow label={t('caseDetail.districtLabel')} value={caseData.district} />
      <OptionalRow label={t('report.locationName')} value={caseData.location_name} />
      <MetaRow label={t('caseDetail.incident')} value={incidentDate} />
      <OptionalRow label={t('report.incidentTime')} value={incidentTime} />
      <MetaRow label={t('caseDetail.submitted')} value={formatDate(caseData.created_at)} />
      <MetaRow label={t('caseDetail.updated')} value={formatDate(caseData.updated_at)} />
    </View>
  );
}

// A card for the richer, optional report sections. Renders only the fields the
// reporter actually provided (data minimisation — empty fields are hidden).
function ReportDetailsCard({ caseData }: { caseData: CaseDetail }) {
  const { t } = useTranslation();
  const assistance = caseData.assistance_requested.length
    ? caseData.assistance_requested.map((a) => t(`assistanceTypes.${a}`)).join(', ')
    : null;
  const witnesses =
    caseData.other_witnesses ? t(`triState.${caseData.other_witnesses}`) : null;
  const prior =
    caseData.previously_reported ? t(`priorReport.${caseData.previously_reported}`) : null;

  const rows = [
    { label: t('report.peopleInvolved'), value: caseData.people_involved },
    { label: t('report.victimInfo'), value: caseData.victim_information },
    { label: t('report.otherWitnesses'), value: witnesses },
    { label: t('report.witnessDetails'), value: caseData.witness_details },
    { label: t('report.previouslyReported'), value: prior },
    { label: t('report.previousReportDetails'), value: caseData.previous_report_details },
    { label: t('report.assistance'), value: assistance },
    { label: t('report.additionalInfo'), value: caseData.additional_information },
  ].filter((r) => r.value);

  if (rows.length === 0) return null;
  return (
    <View style={local.card}>
      <Text style={local.cardTitle}>{t('caseDetail.reportDetailsTitle')}</Text>
      {rows.map((r) => (
        <View key={r.label} style={local.detailBlock}>
          <Text style={local.metaLabel}>{r.label}</Text>
          <Text style={local.detailValue}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={local.metaRow}>
      <Text style={local.metaLabel}>{label}</Text>
      <Text style={local.metaValue}>{value}</Text>
    </View>
  );
}

// Same as MetaRow but hides itself when the value is empty/null.
function OptionalRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <MetaRow label={label} value={value} />;
}

function NarrativeCard({ description }: { description: string }) {
  const { t } = useTranslation();
  return (
    <View style={local.card}>
      <Text style={local.cardTitle}>{t('caseDetail.narrativeTitle')}</Text>
      {/* Staff-only: the narrative is shown here but must never be logged. */}
      <Text style={local.narrative}>{description}</Text>
    </View>
  );
}

function EvidenceCard({ caseData }: { caseData: CaseDetail }) {
  const { t } = useTranslation();

  const openEvidence = useCallback(() => {
    // The URL is short-lived and minted server-side. Never log it.
    if (caseData.evidence_url) {
      Linking.openURL(caseData.evidence_url).catch(() => {
        // Swallow — a failed open is not case content; the refresh hint covers it.
      });
    }
  }, [caseData.evidence_url]);

  return (
    <View style={local.card}>
      <Text style={local.cardTitle}>{t('caseDetail.evidenceTitle')}</Text>
      {caseData.evidence_description ? (
        <Text style={local.evidenceDesc}>{caseData.evidence_description}</Text>
      ) : null}
      {caseData.has_evidence && caseData.evidence_url ? (
        <>
          <Pressable
            onPress={openEvidence}
            style={theme.btnSecondary}
            accessibilityRole="button"
            accessibilityLabel={t('caseDetail.openEvidence')}
          >
            <Text style={theme.btnSecondaryText}>{t('caseDetail.openEvidence')}</Text>
          </Pressable>
          <Text style={local.hint}>{t('caseDetail.evidenceShortLived')}</Text>
        </>
      ) : (
        <Text style={local.muted}>{t('caseDetail.noEvidence')}</Text>
      )}
    </View>
  );
}

function AssignCard({
  caseData,
  orgs,
  onDone,
  onAuthError,
}: {
  caseData: CaseDetail;
  orgs: Organisation[];
  onDone: () => void;
  onAuthError: (err: unknown) => boolean;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A sentinel for the "unassign" option — SelectField uses string values, so we
  // reserve an empty string to mean "no organisation" and map it to null.
  const UNASSIGN = '';
  const options: Option[] = useMemo(
    () => [
      { value: UNASSIGN, label: t('caseDetail.unassign') },
      ...orgs.map((o) => ({ value: o.id, label: `${o.name} · ${o.district}` })),
    ],
    [orgs, t],
  );

  const save = useCallback(
    async (value: string) => {
      setSaving(true);
      setError(null);
      try {
        await assignCase(caseData.id, value ? value : null);
        onDone();
      } catch (err) {
        if (onAuthError(err)) return;
        setError(t('caseDetail.assignFailed'));
      } finally {
        setSaving(false);
      }
    },
    [caseData.id, onDone, onAuthError, t],
  );

  return (
    <View style={local.card}>
      <Text style={local.cardTitle}>{t('caseDetail.assignedTitle')}</Text>
      <Text style={local.muted}>
        {caseData.assigned_org
          ? `${t('caseDetail.assignedTo')}: ${caseData.assigned_org.name} · ${caseData.assigned_org.district}`
          : t('caseDetail.unassigned')}
      </Text>
      <View style={local.spacer} />
      <SelectField
        label={t('caseDetail.assignLabel')}
        placeholder={t('caseDetail.assignPlaceholder')}
        value={caseData.assigned_org_id}
        options={options}
        onChange={save}
      />
      {saving ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? (
        <Text style={local.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function NotesCard({
  caseData,
  onDone,
  onAuthError,
}: {
  caseData: CaseDetail;
  onDone: () => void;
  onAuthError: (err: unknown) => boolean;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [visible, setVisible] = useState(false); // default OFF — internal note
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const trimmed = note.trim();
    if (!trimmed) {
      setError(t('caseDetail.emptyNote'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addCaseNote(caseData.id, { note: trimmed, isReporterVisible: visible });
      // Clear the note text as soon as it has served its purpose (leave no trace
      // in component state beyond what is needed).
      setNote('');
      setVisible(false);
      onDone();
    } catch (err) {
      if (onAuthError(err)) return;
      setError(t('caseDetail.noteFailed'));
    } finally {
      setSaving(false);
    }
  }, [note, visible, caseData.id, onDone, onAuthError, t]);

  return (
    <View style={local.card}>
      <Text style={local.cardTitle}>{t('caseDetail.notesTitle')}</Text>

      {caseData.notes.length === 0 ? (
        <Text style={local.muted}>{t('caseDetail.noNotes')}</Text>
      ) : (
        caseData.notes.map((n) => <NoteRow key={n.id} note={n} />)
      )}

      <View style={local.spacer} />

      <TextInput
        style={[theme.input, theme.textarea]}
        value={note}
        onChangeText={setNote}
        placeholder={t('caseDetail.notePlaceholder')}
        placeholderTextColor={colors.muted}
        multiline
        editable={!saving}
        accessibilityLabel={t('caseDetail.notePlaceholder')}
      />

      <View style={local.toggleRow}>
        <Text style={local.toggleLabel}>{t('caseDetail.visibleToReporter')}</Text>
        <Switch
          value={visible}
          onValueChange={setVisible}
          disabled={saving}
          accessibilityLabel={t('caseDetail.visibleToReporter')}
        />
      </View>

      {error ? (
        <Text style={local.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Pressable
        onPress={submit}
        disabled={saving}
        style={[theme.btnPrimary, saving && theme.btnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={saving ? t('caseDetail.adding') : t('caseDetail.addNote')}
        accessibilityState={{ busy: saving }}
      >
        {saving ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <Text style={theme.btnPrimaryText}>{t('caseDetail.addNote')}</Text>
        )}
      </Pressable>
    </View>
  );
}

function NoteRow({ note }: { note: CaseNote }) {
  const { t } = useTranslation();
  return (
    <View style={local.noteRow}>
      <View style={local.noteTop}>
        <View
          style={[
            local.noteBadge,
            note.is_reporter_visible ? local.noteBadgeVisible : local.noteBadgeInternal,
          ]}
        >
          <Text
            style={[
              local.noteBadgeText,
              note.is_reporter_visible
                ? local.noteBadgeTextVisible
                : local.noteBadgeTextInternal,
            ]}
          >
            {note.is_reporter_visible
              ? t('caseDetail.reporterVisibleBadge')
              : t('caseDetail.internalBadge')}
          </Text>
        </View>
        <Text style={local.noteDate}>{formatDate(note.created_at)}</Text>
      </View>
      <Text style={local.noteText}>{note.note}</Text>
      <Text style={local.noteAuthor}>
        {t('caseDetail.authorLabel')}:{' '}
        {note.author_name || t('caseDetail.unknownAuthor')}
      </Text>
    </View>
  );
}

function StatusActionsCard({
  caseData,
  onDone,
  onAuthError,
}: {
  caseData: CaseDetail;
  onDone: () => void;
  onAuthError: (err: unknown) => boolean;
}) {
  const { t } = useTranslation();
  // The target the user is confirming (only set for a move that needs a reason).
  const [pendingReasonTarget, setPendingReasonTarget] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBackwardMove = useCallback(
    (target: string) => caseData.status === 'referred' && target === 'under_review',
    [caseData.status],
  );

  const doChange = useCallback(
    async (target: string, reasonText?: string) => {
      setSaving(true);
      setError(null);
      try {
        await changeCaseStatus(caseData.id, { status: target, reason: reasonText });
        setPendingReasonTarget(null);
        setReason('');
        onDone();
      } catch (err) {
        if (onAuthError(err)) return;
        setError(t('caseDetail.statusFailed'));
      } finally {
        setSaving(false);
      }
    },
    [caseData.id, onDone, onAuthError, t],
  );

  const onPressTarget = useCallback(
    (target: string) => {
      // A backward referred→under_review move must be justified: reveal a reason
      // input and defer the request until the staffer confirms.
      if (isBackwardMove(target)) {
        setError(null);
        setPendingReasonTarget(target);
        return;
      }
      doChange(target);
    },
    [isBackwardMove, doChange],
  );

  const confirmReason = useCallback(() => {
    if (!pendingReasonTarget) return;
    if (!reason.trim()) {
      setError(t('caseDetail.reasonRequired'));
      return;
    }
    doChange(pendingReasonTarget, reason.trim());
  }, [pendingReasonTarget, reason, doChange, t]);

  if (caseData.allowed_transitions.length === 0) {
    return null;
  }

  return (
    <View style={local.card}>
      <Text style={local.cardTitle}>{t('caseDetail.statusActionsTitle')}</Text>

      {caseData.allowed_transitions.map((target) => (
        <Pressable
          key={target}
          onPress={() => onPressTarget(target)}
          disabled={saving || pendingReasonTarget !== null}
          style={[
            theme.btnSecondary,
            (saving || pendingReasonTarget !== null) && theme.btnDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('caseDetail.moveTo', {
            status: t(`statuses.${target}`),
          })}
        >
          <Text style={theme.btnSecondaryText}>
            {t('caseDetail.moveTo', { status: t(`statuses.${target}`) })}
          </Text>
        </Pressable>
      ))}

      {pendingReasonTarget ? (
        <View style={local.reasonBox}>
          <TextInput
            style={[theme.input, theme.textarea]}
            value={reason}
            onChangeText={setReason}
            placeholder={t('caseDetail.reasonPlaceholder')}
            placeholderTextColor={colors.muted}
            multiline
            editable={!saving}
            accessibilityLabel={t('caseDetail.reasonPlaceholder')}
          />
          <Pressable
            onPress={confirmReason}
            disabled={saving}
            style={[theme.btnPrimary, saving && theme.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('caseDetail.confirm')}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={theme.btnPrimaryText}>{t('caseDetail.confirm')}</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              setPendingReasonTarget(null);
              setReason('');
              setError(null);
            }}
            disabled={saving}
            style={theme.btnLink}
            accessibilityRole="button"
            accessibilityLabel={t('caseDetail.cancel')}
          >
            <Text style={theme.btnLinkText}>{t('caseDetail.cancel')}</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <Text style={local.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// Format an ISO timestamp for display; fall back to the raw string on
// unparseable input so we never crash on unexpected data (mirrors reports.tsx).
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
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, paddingBottom: 40 },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  header: { marginBottom: 8 },
  backBtn: { paddingVertical: 6, alignSelf: 'flex-start' },
  backText: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  reference: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    fontFamily: 'monospace',
    flexShrink: 1,
    marginRight: 8,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.primaryTint,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  caseTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 10 },
  // Risk flag under the header — high = red, not-sure = amber.
  riskBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  riskHigh: { backgroundColor: '#FDECEC', borderColor: colors.danger },
  riskMed: { backgroundColor: colors.secondaryTint, borderColor: colors.secondary },
  riskText: { fontSize: 13, fontWeight: '800' },
  riskTextHigh: { color: '#7A1416' },
  riskTextMed: { color: colors.secondaryOnLight },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginTop: 16,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metaLabel: { fontSize: 14, color: colors.muted, marginRight: 12 },
  metaValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  narrative: { fontSize: 15, lineHeight: 22, color: colors.text },
  detailBlock: { marginBottom: 12 },
  detailValue: { fontSize: 15, lineHeight: 21, color: colors.text, marginTop: 2 },
  evidenceDesc: { fontSize: 15, lineHeight: 21, color: colors.text, marginBottom: 12 },
  hint: { fontSize: 13, color: colors.muted, marginTop: 10, lineHeight: 18 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  spacer: { height: 12 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  toggleLabel: { fontSize: 15, color: colors.text, flexShrink: 1, marginRight: 12 },
  errorText: { fontSize: 14, color: colors.danger, marginTop: 12 },
  noteRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 12,
  },
  noteTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  noteBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 },
  noteBadgeInternal: { backgroundColor: colors.primaryTint },
  noteBadgeVisible: { backgroundColor: '#d7ede2' },
  noteBadgeText: { fontSize: 11, fontWeight: '700' },
  noteBadgeTextInternal: { color: colors.primary },
  noteBadgeTextVisible: { color: '#1a6b47' },
  noteDate: { fontSize: 12, color: colors.muted },
  noteText: { fontSize: 15, lineHeight: 21, color: colors.text },
  noteAuthor: { fontSize: 12, color: colors.muted, marginTop: 6 },
  reasonBox: { marginTop: 12 },
});
