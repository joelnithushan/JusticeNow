/**
 * JusticeNow (mobile) — Incident location picker (map).
 *
 * Lets a reporter drop a pin on a map to identify WHERE an incident happened.
 *
 * PRIVACY (important): JusticeNow is anonymous, so we deliberately DO NOT store
 * raw coordinates. The pin is reverse-geocoded to a coarse PLACE NAME + district
 * and only that text is returned to the form (same data model as typing a place
 * name by hand). The map is centred on Sri Lanka and never shows or stores the
 * reporter's own location. This keeps the incident location coarse and safe.
 *
 * NOTE: react-native-maps is a native module and requires a custom dev build or
 * production build. In standard Expo Go it is unavailable — a fallback UI is
 * shown instead so the rest of the app is not affected.
 */

import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { DISTRICTS } from '../src/constants';
import { colors } from '../src/theme';

// react-native-maps requires a native build — gracefully degrade in Expo Go.
let MapView: any = null;
let Marker: any = null;
let mapsAvailable = false;
try {
  const RNMaps = require('react-native-maps');
  MapView = RNMaps.default;
  Marker = RNMaps.Marker;
  mapsAvailable = true;
} catch {
  mapsAvailable = false;
}

type Coord = { latitude: number; longitude: number };
export type PickedLocation = { placeName: string; district: string | null };

// Centre of Sri Lanka; wide enough to show the whole island on open.
const SL_REGION = {
  latitude: 7.8731,
  longitude: 80.7718,
  latitudeDelta: 3.4,
  longitudeDelta: 3.4,
};

export default function LocationPickerModal({
  visible,
  onClose,
  onPicked,
}: {
  visible: boolean;
  onClose: () => void;
  onPicked: (loc: PickedLocation) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [coord, setCoord] = useState<Coord | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!coord || busy) return;
    setBusy(true);
    try {
      // Reverse-geocode the PIN only (never the reporter's own location). This
      // does not require location permission.
      const results = await Location.reverseGeocodeAsync(coord);
      const r = results[0] ?? {};
      // Build a readable, coarse place name from the address parts.
      const parts = [r.name, r.street, r.city].filter(Boolean) as string[];
      const placeName = [...new Set(parts)].slice(0, 2).join(', ') || r.region || '';
      // Match a Sri Lankan district if the geocode names one.
      const hay = [r.district, r.subregion, r.city, r.region]
        .filter(Boolean)
        .map((s) => (s as string).toLowerCase());
      const district =
        DISTRICTS.find((d) => hay.some((h) => h.includes(d.toLowerCase()))) ?? null;
      onPicked({ placeName, district });
    } catch {
      // Best-effort: on a geocoding failure, return nothing rather than raw GPS.
      onPicked({ placeName: '', district: null });
    } finally {
      setBusy(false);
      setCoord(null);
    }
  };

  const close = () => {
    setCoord(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.container}>
        {mapsAvailable ? (
          <MapView
            style={StyleSheet.absoluteFill}
            initialRegion={SL_REGION}
            onPress={(e: any) => setCoord(e.nativeEvent.coordinate)}
          >
            {coord ? (
              <Marker
                coordinate={coord}
                draggable
                pinColor={colors.primary}
                onDragEnd={(e: any) => setCoord(e.nativeEvent.coordinate)}
              />
            ) : null}
          </MapView>
        ) : (
          /* Fallback when running in standard Expo Go (native maps unavailable) */
          <View style={styles.fallback}>
            <Text style={styles.fallbackIcon}>🗺️</Text>
            <Text style={styles.fallbackTitle}>Map not available</Text>
            <Text style={styles.fallbackText}>
              The interactive map requires a full build of the app.{'\n'}
              You can still type the location manually in the form.
            </Text>
            <Pressable onPress={close} style={styles.useBtn} accessibilityRole="button">
              <Text style={styles.useText}>Go back</Text>
            </Pressable>
          </View>
        )}

        {/* Instruction pill at the top. */}
        <View style={[styles.hintWrap, { top: insets.top + 12 }]} pointerEvents="none">
          <Text style={styles.hint}>{t('report.mapPrompt')}</Text>
        </View>

        {/* Bottom action bar: Cancel + Use this location. */}
        <View style={[styles.bar, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable onPress={close} style={styles.cancelBtn} accessibilityRole="button">
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            onPress={confirm}
            disabled={!coord || busy}
            style={[styles.useBtn, (!coord || busy) && styles.useBtnDisabled]}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={styles.useText}>{t('report.useThisLocation')}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  hintWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  hint: {
    backgroundColor: 'rgba(10,53,89,0.92)',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    overflow: 'hidden',
    textAlign: 'center',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  cancelText: { fontSize: 16, fontWeight: '700', color: colors.text },
  useBtn: {
    flex: 2,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  useBtnDisabled: { backgroundColor: colors.primaryTint },
  useText: { fontSize: 16, fontWeight: '700', color: colors.primaryText },
  // Fallback styles for when react-native-maps is unavailable (Expo Go)
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  fallbackIcon: { fontSize: 56 },
  fallbackTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  fallbackText: {
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 22,
  },
});
