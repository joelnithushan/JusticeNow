/**
 * JusticeNow (mobile) — District heat map for the public Transparency page.
 *
 * Renders a static (non-interactive) map of Sri Lanka with one shaded circle
 * per district that has cases, sized and darkened by the case COUNT. It is a
 * visual companion to the by-district bar list — the list stays the accessible,
 * exact-number source of truth; this is the at-a-glance geographic picture.
 *
 * PRIVACY / ANONYMITY (see CLAUDE.md): the data is district-level aggregate
 * COUNTS only — the same numbers already shown as bars. A circle sits at the
 * district CENTROID, never at an incident location (we never have one — reports
 * carry no coordinates). Nothing here identifies a reporter, and the map is
 * fed purely from the public transparency figures.
 *
 * react-native-maps is a native module; like LocationPickerModal we require() it
 * defensively so the screen still works (returns null → bar list only) if the
 * app is running somewhere the native map is unavailable.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../src/theme';

// Defensive require — mirrors LocationPickerModal so we degrade gracefully.
let MapView: any = null;
let Circle: any = null;
let mapsAvailable = false;
try {
  const RNMaps = require('react-native-maps');
  MapView = RNMaps.default;
  Circle = RNMaps.Circle;
  mapsAvailable = true;
} catch {
  mapsAvailable = false;
}

// Whole-island framing, matching the location picker.
const SL_REGION = { latitude: 7.8731, longitude: 80.7718, latitudeDelta: 3.7, longitudeDelta: 3.7 };

// Approximate CENTROID of each of the 25 districts. Deliberately coarse — these
// are district centres, not incident points (JusticeNow stores no coordinates).
const CENTROIDS: Record<string, { latitude: number; longitude: number }> = {
  Ampara: { latitude: 7.3, longitude: 81.68 },
  Anuradhapura: { latitude: 8.35, longitude: 80.63 },
  Badulla: { latitude: 6.99, longitude: 81.06 },
  Batticaloa: { latitude: 7.72, longitude: 81.7 },
  Colombo: { latitude: 6.87, longitude: 79.96 },
  Galle: { latitude: 6.18, longitude: 80.28 },
  Gampaha: { latitude: 7.2, longitude: 80.0 },
  Hambantota: { latitude: 6.3, longitude: 81.2 },
  Jaffna: { latitude: 9.7, longitude: 80.1 },
  Kalutara: { latitude: 6.6, longitude: 80.1 },
  Kandy: { latitude: 7.3, longitude: 80.7 },
  Kegalle: { latitude: 7.15, longitude: 80.35 },
  Kilinochchi: { latitude: 9.38, longitude: 80.4 },
  Kurunegala: { latitude: 7.65, longitude: 80.3 },
  Mannar: { latitude: 8.9, longitude: 80.0 },
  Matale: { latitude: 7.65, longitude: 80.75 },
  Matara: { latitude: 6.05, longitude: 80.55 },
  Monaragala: { latitude: 6.87, longitude: 81.35 },
  Mullaitivu: { latitude: 9.2, longitude: 80.75 },
  'Nuwara Eliya': { latitude: 6.95, longitude: 80.75 },
  Polonnaruwa: { latitude: 7.95, longitude: 81.0 },
  Puttalam: { latitude: 8.03, longitude: 79.95 },
  Ratnapura: { latitude: 6.68, longitude: 80.6 },
  Trincomalee: { latitude: 8.57, longitude: 81.1 },
  Vavuniya: { latitude: 8.75, longitude: 80.5 },
};

// Navy (colors.primary #0A3559) as an rgba base so we can vary opacity by heat.
const HEAT_RGB = '10, 53, 89';

/** True only when the native map module loaded — screen uses this to decide
 *  whether to show the map at all. */
export const districtMapAvailable = mapsAvailable;

export default function DistrictHeatMap({ byDistrict }: { byDistrict: Record<string, number> }) {
  const { t } = useTranslation();
  if (!mapsAvailable) return null;

  const entries = Object.entries(byDistrict).filter(([d, v]) => v > 0 && CENTROIDS[d]);
  if (entries.length === 0) return null;
  const max = Math.max(...entries.map(([, v]) => v));

  return (
    <View style={styles.wrap} accessibilityLabel={t('transparency.mapA11y')}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={SL_REGION}
        // Static dashboard image: no gestures, so the page keeps scrolling and
        // the map cannot be panned away from Sri Lanka.
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {entries.map(([district, count]) => {
          const heat = count / max; // 0..1
          const radius = 9000 + heat * 33000; // metres
          const fillOpacity = 0.3 + heat * 0.55;
          return (
            <Circle
              key={district}
              center={CENTROIDS[district]}
              radius={radius}
              fillColor={`rgba(${HEAT_RGB}, ${fillOpacity})`}
              strokeColor={`rgba(${HEAT_RGB}, 0.85)`}
              strokeWidth={1}
            />
          );
        })}
      </MapView>

      {/* Legend — light-to-dark = fewer-to-more cases. */}
      <View style={styles.legend}>
        <Text style={styles.legendText}>{t('transparency.mapFewer')}</Text>
        <View style={[styles.dot, { backgroundColor: `rgba(${HEAT_RGB}, 0.3)` }]} />
        <View style={[styles.dot, { backgroundColor: `rgba(${HEAT_RGB}, 0.6)` }]} />
        <View style={[styles.dot, { backgroundColor: `rgba(${HEAT_RGB}, 0.9)` }]} />
        <Text style={styles.legendText}>{t('transparency.mapMore')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 300,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  legend: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  legendText: { fontSize: 12, fontWeight: '700', color: colors.text },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
