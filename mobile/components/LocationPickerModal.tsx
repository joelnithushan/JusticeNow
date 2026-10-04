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
import * as Location from 'expo-location';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { placesAutocomplete, placeDetails } from '../src/api/client';
import type { PlacePrediction } from '../src/api/client';
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
  const mapRef = useRef<any>(null);
  const [coord, setCoord] = useState<Coord | null>(null);
  const [busy, setBusy] = useState(false);
  // Place search. Primary path: Google Places autocomplete (proxied by our
  // server). Fallback: the on-device geocoder when the server has no Google key.
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  // Flips true if the server has no Google key (503) — we then hide suggestions
  // and let the Go button run the basic on-device geocoder instead.
  const [googleDisabled, setGoogleDisabled] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Groups a run of keystrokes + the follow-up details lookup into one Google
  // billing session. Regenerated after each pick. (Not security-sensitive.)
  const sessionRef = useRef<string>('');
  const newSession = () => {
    sessionRef.current = `${Math.floor(Math.random() * 1e9).toString(36)}${Math.floor(
      Math.random() * 1e9,
    ).toString(36)}`;
    return sessionRef.current;
  };

  // Ask the server (→ Google) for suggestions. Debounced by the caller. On a 503
  // (no key configured) we permanently fall back to the on-device geocoder.
  const runAutocomplete = async (q: string) => {
    if (q.trim().length < 2) {
      setPredictions([]);
      return;
    }
    if (!sessionRef.current) newSession();
    setSearching(true);
    setNotFound(false);
    try {
      const res = await placesAutocomplete(q.trim(), sessionRef.current);
      setPredictions(res.data.data.predictions || []);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 503) {
        setGoogleDisabled(true); // no Google key — use the geocoder fallback
        setPredictions([]);
      } else {
        setPredictions([]);
      }
    } finally {
      setSearching(false);
    }
  };

  // Fired on every keystroke. Debounces the autocomplete call (avoids a request
  // per character). No-op for suggestions once we've fallen back to the geocoder.
  const onQueryChange = (text: string) => {
    setQuery(text);
    if (notFound) setNotFound(false);
    if (googleDisabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runAutocomplete(text), 300);
  };

  // A suggestion was tapped → resolve it to coordinates and drop the pin there.
  const pickPrediction = async (p: PlacePrediction) => {
    Keyboard.dismiss();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    setNotFound(false);
    try {
      const res = await placeDetails(p.place_id, sessionRef.current);
      const { latitude, longitude } = res.data.data.place;
      const next = { latitude, longitude };
      setCoord(next);
      setQuery(p.description || p.main_text);
      setPredictions([]);
      sessionRef.current = ''; // end the billing session; next search starts a new one
      mapRef.current?.animateToRegion(
        { ...next, latitudeDelta: 0.04, longitudeDelta: 0.04 },
        600,
      );
    } catch {
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  };

  // Fallback search (on-device geocoder) — used when Google isn't configured, or
  // when the user hits the keyboard's search key without picking a suggestion.
  // Forward-geocodes the TYPED text only (never the reporter's device location).
  const search = async () => {
    const q = query.trim();
    if (!q || searching) return;
    // If suggestions are showing, prefer the first one (feels like "search").
    if (!googleDisabled && predictions.length > 0) {
      pickPrediction(predictions[0]);
      return;
    }
    Keyboard.dismiss();
    setSearching(true);
    setNotFound(false);
    try {
      const biased = /sri\s*lanka/i.test(q) ? q : `${q}, Sri Lanka`;
      const results = await Location.geocodeAsync(biased);
      const hit = results[0];
      if (!hit) {
        setNotFound(true);
        return;
      }
      const next = { latitude: hit.latitude, longitude: hit.longitude };
      setCoord(next);
      mapRef.current?.animateToRegion(
        { ...next, latitudeDelta: 0.04, longitudeDelta: 0.04 },
        600,
      );
    } catch {
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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setCoord(null);
    setQuery('');
    setNotFound(false);
    setPredictions([]);
    sessionRef.current = '';
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.container}>
        {mapsAvailable ? (
          <MapView
            ref={mapRef}
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

        {/* Search a place by name (only meaningful with the interactive map). */}
        {mapsAvailable ? (
          <View style={[styles.searchWrap, { top: insets.top + 12 }]}>
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={onQueryChange}
                placeholder={t('report.mapSearchPlaceholder')}
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                onSubmitEditing={search}
                autoCorrect={false}
              />
              {searching ? (
                <ActivityIndicator color={colors.primary} style={styles.searchSpinner} />
              ) : query.trim() ? (
                <Pressable
                  onPress={search}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('report.mapSearchAction')}
                >
                  <Text style={styles.searchGo}>{t('report.mapSearchAction')}</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Suggestion dropdown (Google Places). Tap one to drop the pin. */}
            {predictions.length > 0 ? (
              <View style={styles.suggestions}>
                {predictions.map((p, i) => (
                  <Pressable
                    key={p.place_id}
                    onPress={() => pickPrediction(p)}
                    style={[styles.suggestion, i > 0 && styles.suggestionDivider]}
                    accessibilityRole="button"
                    accessibilityLabel={p.description}
                  >
                    <Text style={styles.suggestionIcon}>📍</Text>
                    <View style={styles.suggestionText}>
                      <Text style={styles.suggestionMain} numberOfLines={1}>
                        {p.main_text || p.description}
                      </Text>
                      {p.secondary_text ? (
                        <Text style={styles.suggestionSub} numberOfLines={1}>
                          {p.secondary_text}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {notFound ? <Text style={styles.searchError}>{t('report.mapSearchNotFound')}</Text> : null}
          </View>
        ) : null}

        {/* Instruction pill, below the search bar. */}
        <View
          style={[styles.hintWrap, { top: insets.top + (mapsAvailable ? 70 : 12) }]}
          pointerEvents="none"
        >
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
  // Place-search overlay at the top of the map.
  searchWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
  searchSpinner: { marginLeft: 4 },
  searchGo: { fontSize: 14, fontWeight: '700', color: colors.primary },
  // Autocomplete suggestion dropdown under the search bar.
  suggestions: {
    marginTop: 6,
    backgroundColor: colors.background,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  suggestionDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  suggestionIcon: { fontSize: 14 },
  suggestionText: { flex: 1 },
  suggestionMain: { fontSize: 15, fontWeight: '600', color: colors.text },
  suggestionSub: { fontSize: 13, color: colors.muted, marginTop: 1 },
  searchError: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(176,0,32,0.95)',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    overflow: 'hidden',
  },
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
