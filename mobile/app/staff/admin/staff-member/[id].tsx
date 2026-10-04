/**
 * JusticeNow (mobile) — Admin Staff screen.
 * Route: /staff/admin/staff-member/[id].
 *   - id === 'new'  → CREATE form (add a staff account).
 *   - id === <uuid> → read-only DETAIL view of an existing account, with the
 *     admin moderation actions (suspend / lift suspension / delete). By product
 *     decision an admin does NOT edit a colleague's details here — they VIEW the
 *     whole account and may suspend (with a reason) or delete (with a reason).
 *
 * AUTHORIZATION: ADMIN ONLY (CLAUDE.md — "Manage organisations and staff").
 * Every call goes through the token-bearing staffApi against admin-guarded
 * endpoints; the server is the real boundary. The `!isAdmin` Redirect is UX. A
 * 401 means the in-memory token expired → log out and return to login.
 *
 * SECURITY: the create password is write-only PLAINTEXT sent to the server, which
 * hashes it. We NEVER render, store, or log a password_hash. Suspend/delete
 * reasons are case-adjacent staff data — shown in the UI but never logged.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import axios from 'axios';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import SelectField, { type Option } from '../../../../components/SelectField';
import ErrorState from '../../../../components/ErrorState';
import StaffHeader from '../../../../components/StaffHeader';
import DefaultAvatar from '../../../../components/DefaultAvatar';
import {
  fetchAllOrganisations,
  fetchStaffMember,
  createStaff,
  suspendStaffMember,
  unsuspendStaffMember,
  deleteStaffMember,
} from '../../../../src/api/client';
import type { StaffInput, StaffMemberDetail, AdminOrganisation } from '../../../../src/api/client';
import { STAFF_ROLES } from '../../../../src/constants';
import { useAuth } from '../../../../src/context/AuthContext';
import { colors, styles as theme } from '../../../../src/theme';

// Sri Lankan shape checks (server re-validates + derives gender/DOB from the NIC).
const NIC_RE = /^(\d{9}[VvXx]|\d{12})$/;
const LK_MOBILE_RE = /^(?:\+94|0094|94|0)?7[0-8]\d{7}$/;

export default function AdminStaffMemberScreen() {
  const { isAdmin } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!isAdmin) {
    return <Redirect href="/staff/reports" />;
  }
  return id === 'new' ? <CreateStaffForm /> : <StaffDetailView id={id as string} />;
}

/* ───────────────────────── Create form (add a staff account) ───────────────── */

function CreateStaffForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const { logout } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [nic, setNic] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [barNumber, setBarNumber] = useState('');
  const [department, setDepartment] = useState('');

  const [orgs, setOrgs] = useState<AdminOrganisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) => setFieldErrors((e) => (e[k] ? { ...e, [k]: '' } : e));

  const goToLogin = useCallback(() => {
    logout();
    router.replace('/staff/login');
  }, [logout, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const orgRes = await fetchAllOrganisations();
      setOrgs(orgRes.data.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        goToLogin();
        return;
      }
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [goToLogin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = useCallback(async () => {
    const next: Record<string, string> = {};
    // The platform admin ('admin') is unrestricted across every org → no org field.
    const isAdminRole = role === 'admin';
    if (!name.trim()) next.name = t('adminStaff.nameRequired');
    if (!email.trim()) next.email = t('adminStaff.emailRequired');
    if (!role) next.role = t('adminStaff.roleRequired');
    if (!isAdminRole && !organisationId) next.organisation = t('adminStaff.organisationRequired');
    if (!password) next.password = t('adminStaff.passwordRequired');
    const nicTrim = nic.trim();
    if (!nicTrim) next.nic = t('staffRegister.errors.nicRequired');
    else if (!NIC_RE.test(nicTrim)) next.nic = t('staffRegister.errors.nicInvalid');
    const phoneTrim = phone.trim().replace(/[\s-]/g, '');
    if (!phoneTrim) next.phone = t('staffRegister.errors.phoneRequired');
    else if (!LK_MOBILE_RE.test(phoneTrim)) next.phone = t('staffRegister.errors.phoneInvalid');
    if (!designation.trim()) next.designation = t('staffRegister.errors.designationRequired');
    if (role === 'attorney' && !barNumber.trim()) next.barNumber = t('staffRegister.errors.barNumberRequired');
    if (role === 'officer' && !department.trim()) next.department = t('staffRegister.errors.departmentRequired');
    setFieldErrors(next);
    if (Object.keys(next).length > 0) return;
    if (!role || (!isAdminRole && !organisationId)) return;

    setFormError(null);
    setSaving(true);
    const payload: StaffInput = {
      name: name.trim(),
      email: email.trim(),
      role,
      organisation_id: isAdminRole ? null : organisationId,
      password,
      nic: nic.trim(),
      phone: phone.trim(),
      designation: designation.trim(),
    };
    if (role === 'attorney') payload.bar_number = barNumber.trim();
    if (role === 'officer') payload.department = department.trim();

    try {
      await createStaff(payload);
      router.back();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        goToLogin();
        return;
      }
      const message =
        axios.isAxiosError(err) && err.response?.data?.message
          ? String(err.response.data.message)
          : t('adminStaff.networkError');
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }, [name, email, role, organisationId, password, nic, phone, designation, barNumber, department, router, goToLogin, t]);

  const roleOptions: Option[] = STAFF_ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }));
  const orgOptions: Option[] = orgs.map((o) => ({ value: o.id, label: o.name }));

  return (
    <View style={local.screen}>
      <StaffHeader title={t('adminStaff.new')} onBack={() => router.back()} backLabel={t('common.back')} />
      {loading ? (
        <View style={local.centre}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        </View>
      ) : loadFailed ? (
        <View style={local.centre}>
          <ErrorState message={t('adminStaff.networkError')} onRetry={load} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={local.form} keyboardShouldPersistTaps="handled">
          <Text style={theme.label}>{t('adminStaff.name')}</Text>
          <TextInput
            style={[theme.input, fieldErrors.name ? local.inputError : null]}
            value={name}
            onChangeText={(v) => { setName(v); clearErr('name'); }}
            placeholder={t('adminStaff.namePlaceholder')}
            placeholderTextColor={colors.muted}
            editable={!saving}
          />
          {fieldErrors.name ? <Text style={theme.fieldError}>{fieldErrors.name}</Text> : null}

          <Text style={theme.label}>{t('adminStaff.email')}</Text>
          <TextInput
            style={[theme.input, fieldErrors.email ? local.inputError : null]}
            value={email}
            onChangeText={(v) => { setEmail(v); clearErr('email'); }}
            placeholder={t('adminStaff.emailPlaceholder')}
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
          />
          {fieldErrors.email ? <Text style={theme.fieldError}>{fieldErrors.email}</Text> : null}

          <View style={local.selectWrap}>
            <SelectField
              label={t('adminStaff.role')}
              required
              placeholder={t('adminStaff.role')}
              value={role}
              options={roleOptions}
              onChange={(v) => { setRole(v); clearErr('role'); }}
            />
            {fieldErrors.role ? <Text style={theme.fieldError}>{fieldErrors.role}</Text> : null}
          </View>

          {/* Organisation — hidden for the platform admin (belongs to no org). */}
          {role !== 'admin' ? (
            <View style={local.selectWrap}>
              <SelectField
                label={t('adminStaff.organisation')}
                required
                placeholder={t('adminStaff.organisation')}
                value={organisationId}
                options={orgOptions}
                onChange={(v) => { setOrganisationId(v); clearErr('organisation'); }}
              />
              {fieldErrors.organisation ? <Text style={theme.fieldError}>{fieldErrors.organisation}</Text> : null}
            </View>
          ) : null}

          <Text style={theme.label}>{t('adminStaff.password')}</Text>
          <TextInput
            style={[theme.input, fieldErrors.password ? local.inputError : null]}
            value={password}
            onChangeText={(v) => { setPassword(v); clearErr('password'); }}
            placeholder={t('adminStaff.passwordPlaceholder')}
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
          />
          {fieldErrors.password ? <Text style={theme.fieldError}>{fieldErrors.password}</Text> : null}
          <Text style={local.hint}>{t('adminStaff.passwordHint')}</Text>

          <Text style={theme.label}>{t('staffRegister.nic')}</Text>
          <TextInput
            style={[theme.input, fieldErrors.nic ? local.inputError : null]}
            value={nic}
            onChangeText={(v) => { setNic(v.toUpperCase()); clearErr('nic'); }}
            placeholder={t('staffRegister.nicPlaceholder')}
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            editable={!saving}
          />
          {fieldErrors.nic ? <Text style={theme.fieldError}>{fieldErrors.nic}</Text> : null}

          <Text style={theme.label}>{t('staffRegister.phone')}</Text>
          <TextInput
            style={[theme.input, fieldErrors.phone ? local.inputError : null]}
            value={phone}
            onChangeText={(v) => { setPhone(v); clearErr('phone'); }}
            placeholder={t('staffRegister.phonePlaceholder')}
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            editable={!saving}
          />
          {fieldErrors.phone ? <Text style={theme.fieldError}>{fieldErrors.phone}</Text> : null}

          <Text style={theme.label}>{t('staffRegister.designation')}</Text>
          <TextInput
            style={[theme.input, fieldErrors.designation ? local.inputError : null]}
            value={designation}
            onChangeText={(v) => { setDesignation(v); clearErr('designation'); }}
            placeholder={t('staffRegister.designationPlaceholder')}
            placeholderTextColor={colors.muted}
            editable={!saving}
          />
          {fieldErrors.designation ? <Text style={theme.fieldError}>{fieldErrors.designation}</Text> : null}

          {role === 'attorney' ? (
            <>
              <Text style={theme.label}>{t('staffRegister.barNumber')}</Text>
              <TextInput
                style={[theme.input, fieldErrors.barNumber ? local.inputError : null]}
                value={barNumber}
                onChangeText={(v) => { setBarNumber(v); clearErr('barNumber'); }}
                placeholder={t('staffRegister.barNumberPlaceholder')}
                placeholderTextColor={colors.muted}
                editable={!saving}
              />
              {fieldErrors.barNumber ? <Text style={theme.fieldError}>{fieldErrors.barNumber}</Text> : null}
            </>
          ) : null}

          {role === 'officer' ? (
            <>
              <Text style={theme.label}>{t('staffRegister.department')}</Text>
              <TextInput
                style={[theme.input, fieldErrors.department ? local.inputError : null]}
                value={department}
                onChangeText={(v) => { setDepartment(v); clearErr('department'); }}
                placeholder={t('staffRegister.departmentPlaceholder')}
                placeholderTextColor={colors.muted}
                editable={!saving}
              />
              {fieldErrors.department ? <Text style={theme.fieldError}>{fieldErrors.department}</Text> : null}
            </>
          ) : null}

          {formError ? <Text style={local.errorText}>{formError}</Text> : null}

          <Pressable
            onPress={save}
            disabled={saving}
            style={[theme.btnPrimary, saving && theme.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('adminStaff.save')}
          >
            {saving ? <ActivityIndicator color={colors.primaryText} /> : <Text style={theme.btnPrimaryText}>{t('adminStaff.save')}</Text>}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

/* ───────────────────────── Detail view (existing account) ──────────────────── */

function StaffDetailView({ id }: { id: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { logout } = useAuth();

  const [member, setMember] = useState<StaffMemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState<'notFound' | 'network' | null>(null);
  const [acting, setActing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Reason modal: which action is pending ('suspend' | 'delete'), and the text.
  const [reasonFor, setReasonFor] = useState<'suspend' | 'delete' | null>(null);
  const [reason, setReason] = useState('');

  const goToLogin = useCallback(() => {
    logout();
    router.replace('/staff/login');
  }, [logout, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(null);
    try {
      const res = await fetchStaffMember(id);
      setMember(res.data.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        goToLogin();
        return;
      }
      setLoadFailed(axios.isAxiosError(err) && err.response?.status === 404 ? 'notFound' : 'network');
    } finally {
      setLoading(false);
    }
  }, [id, goToLogin]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Run a moderation action, surfacing the server's specific 400 message (self /
  // last-admin guards) when it refuses.
  const runAction = useCallback(
    async (fn: () => Promise<unknown>) => {
      setFormError(null);
      setActing(true);
      try {
        await fn();
        router.back();
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          goToLogin();
          return;
        }
        const message =
          axios.isAxiosError(err) && err.response?.data?.message
            ? String(err.response.data.message)
            : t('adminStaff.networkError');
        setFormError(message);
      } finally {
        setActing(false);
      }
    },
    [router, goToLogin, t],
  );

  const onUnsuspend = useCallback(() => {
    Alert.alert(t('adminStaff.unsuspend'), t('adminStaff.unsuspendConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('adminStaff.unsuspend'), onPress: () => runAction(() => unsuspendStaffMember(id)) },
    ]);
  }, [id, runAction, t]);

  // Confirm the reason modal: require non-empty text, then call suspend/delete.
  const submitReason = useCallback(() => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setFormError(t('adminStaff.reasonRequired'));
      return;
    }
    const action = reasonFor;
    setReasonFor(null);
    setReason('');
    if (action === 'suspend') runAction(() => suspendStaffMember(id, trimmed));
    else if (action === 'delete') runAction(() => deleteStaffMember(id, trimmed));
  }, [reason, reasonFor, id, runAction, t]);

  if (loading) {
    return (
      <View style={local.screen}>
        <StaffHeader title={t('adminStaff.view')} onBack={() => router.back()} backLabel={t('common.back')} />
        <View style={local.centre}><ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} /></View>
      </View>
    );
  }
  if (loadFailed || !member) {
    return (
      <View style={local.screen}>
        <StaffHeader title={t('adminStaff.view')} onBack={() => router.back()} backLabel={t('common.back')} />
        <View style={local.centre}>
          {loadFailed === 'notFound' ? (
            <Text style={local.emptyText}>{t('adminStaff.empty')}</Text>
          ) : (
            <ErrorState message={t('adminStaff.networkError')} onRetry={load} />
          )}
        </View>
      </View>
    );
  }

  const isSuspended = Boolean(member.suspended_at) && !member.deleted_at;

  return (
    <View style={local.screen}>
      <StaffHeader title={t('adminStaff.view')} onBack={() => router.back()} backLabel={t('common.back')} />
      <ScrollView contentContainerStyle={local.form}>
        {/* Identity: avatar + name + email + role. */}
        <View style={local.identity}>
          {member.avatar_url ? (
            <Image source={{ uri: member.avatar_url }} style={local.avatar} accessibilityIgnoresInvertColors />
          ) : (
            <DefaultAvatar size={84} />
          )}
          <Text style={local.name} accessibilityRole="header">{member.name}</Text>
          <Text style={local.email}>{member.email}</Text>
          <View style={local.badgeRow}>
            <View style={local.roleBadge}><Text style={local.roleBadgeText}>{t(`roles.${member.role}`)}</Text></View>
            {isSuspended ? (
              <View style={local.suspendBadge}><Text style={local.suspendBadgeText}>{t('adminStaff.suspendedBadge')}</Text></View>
            ) : member.is_active ? (
              <View style={local.okBadge}><Text style={local.okBadgeText}>{t('adminStaff.activeBadge')}</Text></View>
            ) : (
              <View style={local.inactiveBadge}><Text style={local.inactiveBadgeText}>{t('adminStaff.inactiveBadge')}</Text></View>
            )}
          </View>
        </View>

        {/* Suspension banner — the reason, shown prominently when suspended. */}
        {isSuspended ? (
          <View style={local.suspendBanner}>
            <Text style={local.suspendBannerTitle}>{t('adminStaff.suspensionReason')}</Text>
            <Text style={local.suspendBannerText}>{member.suspension_reason || t('adminStaff.notProvided')}</Text>
          </View>
        ) : null}

        {/* Account */}
        <Text style={local.sectionTitle}>{t('adminStaff.accountDetails')}</Text>
        <DetailRow label={t('adminStaff.organisation')} value={member.organisation_name || t('adminStaff.notProvided')} />
        <DetailRow label={t('adminStaff.status')} value={t(`accessStatus.${member.access_status}`, member.access_status)} />
        <DetailRow
          label={t('adminStaff.twoFactor')}
          value={member.mfa_enabled
            ? t('adminStaff.twoFactorOn', { method: t(`mfaMethod.${member.mfa_method}`, member.mfa_method || '') })
            : t('adminStaff.twoFactorOff')}
        />

        {/* Profile */}
        <Text style={local.sectionTitle}>{t('adminStaff.profileDetails')}</Text>
        <DetailRow label={t('staffRegister.nic')} value={member.nic || t('adminStaff.notProvided')} />
        <DetailRow label={t('staffRegister.phone')} value={member.phone || t('adminStaff.notProvided')} />
        <DetailRow label={t('staffRegister.designation')} value={member.designation || t('adminStaff.notProvided')} />
        {member.role === 'attorney' ? (
          <DetailRow label={t('staffRegister.barNumber')} value={member.bar_number || t('adminStaff.notProvided')} />
        ) : null}
        {member.role === 'officer' ? (
          <DetailRow label={t('staffRegister.department')} value={member.department || t('adminStaff.notProvided')} />
        ) : null}
        <DetailRow label={t('adminStaff.gender')} value={member.gender || t('adminStaff.notProvided')} />
        <DetailRow label={t('adminStaff.dateOfBirth')} value={member.date_of_birth || t('adminStaff.notProvided')} />

        {formError ? <Text style={local.errorText} accessibilityRole="alert">{formError}</Text> : null}

        {/* Moderation actions. */}
        {isSuspended ? (
          <Pressable
            onPress={onUnsuspend}
            disabled={acting}
            style={[theme.btnPrimary, acting && theme.btnDisabled]}
            accessibilityRole="button"
          >
            {acting ? <ActivityIndicator color={colors.primaryText} /> : <Text style={theme.btnPrimaryText}>{t('adminStaff.unsuspend')}</Text>}
          </Pressable>
        ) : (
          <Pressable
            onPress={() => { setFormError(null); setReason(''); setReasonFor('suspend'); }}
            disabled={acting}
            style={[local.suspendBtn, acting && theme.btnDisabled]}
            accessibilityRole="button"
          >
            <Text style={local.suspendBtnText}>{t('adminStaff.suspend')}</Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => { setFormError(null); setReason(''); setReasonFor('delete'); }}
          disabled={acting}
          style={[local.deleteBtn, acting && theme.btnDisabled]}
          accessibilityRole="button"
        >
          <Text style={local.deleteText}>{t('adminStaff.delete')}</Text>
        </Pressable>
      </ScrollView>

      {/* Reason modal (suspend / delete). */}
      <Modal visible={reasonFor !== null} transparent animationType="fade" onRequestClose={() => setReasonFor(null)}>
        <View style={local.modalBackdrop}>
          <View style={local.modalCard}>
            <Text style={local.modalTitle}>
              {reasonFor === 'delete' ? t('adminStaff.deleteReasonTitle') : t('adminStaff.suspendReasonTitle')}
            </Text>
            <Text style={local.modalPrompt}>
              {reasonFor === 'delete' ? t('adminStaff.deleteReasonPrompt') : t('adminStaff.suspendReasonPrompt')}
            </Text>
            <TextInput
              style={local.modalInput}
              value={reason}
              onChangeText={setReason}
              placeholder={t('adminStaff.reasonPlaceholder')}
              placeholderTextColor={colors.muted}
              multiline
              autoFocus
            />
            <View style={local.modalActions}>
              <Pressable style={local.modalCancel} onPress={() => { setReasonFor(null); setReason(''); }} accessibilityRole="button">
                <Text style={local.modalCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[reasonFor === 'delete' ? local.modalConfirmDanger : local.modalConfirm]}
                onPress={submitReason}
                accessibilityRole="button"
              >
                <Text style={local.modalConfirmText}>
                  {reasonFor === 'delete' ? t('adminStaff.delete') : t('adminStaff.suspend')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={local.row}>
      <Text style={local.rowLabel}>{label}</Text>
      <Text style={local.rowValue}>{value}</Text>
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centre: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, paddingTop: 48 },
  emptyText: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  form: { paddingHorizontal: 20, paddingBottom: 48 },
  selectWrap: { marginTop: 12 },
  hint: { fontSize: 13, color: colors.muted, marginTop: 6 },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 14, marginTop: 12 },

  // Detail view — identity block.
  identity: { alignItems: 'center', paddingVertical: 16 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primaryTint },
  name: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 12, textAlign: 'center' },
  email: { fontSize: 14, color: colors.muted, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
  roleBadge: { backgroundColor: colors.primaryTint, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  roleBadgeText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  okBadge: { backgroundColor: '#E6F4EA', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  okBadgeText: { color: '#1E7D34', fontSize: 13, fontWeight: '700' },
  inactiveBadge: { backgroundColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  inactiveBadgeText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  suspendBadge: { backgroundColor: '#FCE8E6', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  suspendBadgeText: { color: colors.danger, fontSize: 13, fontWeight: '700' },

  suspendBanner: {
    backgroundColor: '#FCE8E6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3B9B2',
    padding: 14,
    marginTop: 4,
    marginBottom: 8,
  },
  suspendBannerTitle: { fontSize: 13, fontWeight: '800', color: colors.danger, marginBottom: 4 },
  suspendBannerText: { fontSize: 15, color: colors.text, lineHeight: 21 },

  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.muted, marginTop: 22, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 16,
  },
  rowLabel: { fontSize: 14, color: colors.muted, flexShrink: 0 },
  rowValue: { fontSize: 15, color: colors.text, fontWeight: '600', flex: 1, textAlign: 'right' },

  suspendBtn: {
    paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 24,
    borderWidth: 1.5, borderColor: colors.danger, backgroundColor: colors.background,
  },
  suspendBtnText: { fontSize: 16, fontWeight: '700', color: colors.danger },
  deleteBtn: {
    paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 12,
    backgroundColor: colors.danger,
  },
  deleteText: { fontSize: 16, fontWeight: '800', color: '#ffffff' },

  // Reason modal.
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.background, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  modalPrompt: { fontSize: 14, color: colors.muted, marginTop: 6, lineHeight: 20 },
  modalInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginTop: 14,
    minHeight: 80, textAlignVertical: 'top', color: colors.text, fontSize: 15,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  modalCancel: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10 },
  modalCancelText: { fontSize: 15, fontWeight: '700', color: colors.muted },
  modalConfirm: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, backgroundColor: colors.danger },
  modalConfirmDanger: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, backgroundColor: colors.danger },
  modalConfirmText: { fontSize: 15, fontWeight: '800', color: '#ffffff' },
});
