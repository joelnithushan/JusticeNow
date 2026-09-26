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
 */

import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { DISTRICTS } from '../src/constants';
import { colors } from '../src/theme';

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
  const mapRef = useRef<MapView>(null);
  const [coord, setCoord] = useState<Coord | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Forward-geocode a typed place name (e.g. "Jaffna Bus Stand") to a coordinate
  // and drop the pin there. We use OpenStreetMap's Nominatim because it resolves
  // named landmarks/POIs (which Apple's geocoder does not), biased to Sri Lanka
  // (countrycodes=lk). Only the place NAME is sent — never any reporter identity —
  // and on confirm we still keep just the coarse reverse-geocoded name + district,
  // matching the rest of this screen's privacy model.
  const search = async () => {
    const q = query.trim();
    if (!q || searching) return;
    Keyboard.dismiss();
    setSearching(true);
    setNotFound(false);
    try {
      const url =
        'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=lk&q=' +
        encodeURIComponent(q);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'JusticeNow/1.0 (anonymous incident reporting)' },
      });
      const hits = (await res.json()) as Array<{ lat: string; lon: string }>;
      const hit = hits[0];
      if (!hit) {
        setNotFound(true);
        return;
      }
      const next = { latitude: parseFloat(hit.lat), longitude: parseFloat(hit.lon) };
      setCoord(next);
      // Zoom in close enough to confirm the spot the search resolved to.
      mapRef.current?.animateToRegion(
        { ...next, latitudeDelta: 0.02, longitudeDelta: 0.02 } as Region,
        500,
      );
    } catch {
      // Search is best-effort; on any failure just prompt the reporter to retry
      // (or fall back to tapping the map). We never surface the raw error.
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  };

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
    setQuery('');
    setNotFound(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={SL_REGION}
          onPress={(e) => {
            setCoord(e.nativeEvent.coordinate);
            setNotFound(false);
          }}
        >
          {coord ? (
            <Marker
              coordinate={coord}
              draggable
              pinColor={colors.primary}
              onDragEnd={(e) => setCoord(e.nativeEvent.coordinate)}
            />
          ) : null}
        </MapView>

        {/* Search + instruction, anchored at the top. */}
        <View style={[styles.topWrap, { top: insets.top + 12 }]}>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                setNotFound(false);
              }}
              placeholder={t('report.mapSearchPlaceholder')}
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              onSubmitEditing={search}
              autoCorrect={false}
              accessibilityLabel={t('report.mapSearchPlaceholder')}
            />
            <Pressable
              onPress={search}
              disabled={!query.trim() || searching}
              style={[styles.searchBtn, (!query.trim() || searching) && styles.searchBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t('report.mapSearch')}
            >
              {searching ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={styles.searchBtnText}>{t('report.mapSearch')}</Text>
              )}
            </Pressable>
          </View>
          <View style={styles.hintWrap} pointerEvents="none">
            <Text style={styles.hint}>
              {notFound ? t('report.mapNoResults') : t('report.mapPrompt')}
            </Text>
          </View>
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
  topWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    gap: 10,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
    // Lift the pill-shaped bar off the map.
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  searchBtn: {
    minWidth: 84,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
  },
  searchBtnDisabled: { backgroundColor: colors.primaryTint },
  searchBtnText: { fontSize: 15, fontWeight: '700', color: colors.primaryText },
  hintWrap: {
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
});
