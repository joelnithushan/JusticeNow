/**
 * JusticeNow (mobile) — Evidence redaction editor (manual tap/drag to cover).
 *
 * Lets a reporter drag boxes over anything IDENTIFYING in a photo — faces,
 * vehicle number plates, name boards, ID cards, tattoos, uniforms — before the
 * image is attached to a report. The boxes are SOLID (opaque), not a blur:
 * a blur can sometimes be reversed, an opaque box cannot, so for an anonymity
 * product redaction is the safer choice.
 *
 * PRIVACY (critical): the redaction is baked in ON-DEVICE. We render the image
 * plus the black rectangles into an <Svg> and rasterise it with toDataURL(),
 * producing a NEW flattened file — the covered pixels are gone from the output,
 * not merely hidden behind an overlay. The original, un-redacted image is never
 * uploaded. Re-rasterising also drops all EXIF/GPS metadata (same guarantee as
 * the existing strip step), and we convert to a fresh JPEG with no filename.
 *
 * No new native module is used: react-native-svg is already a dependency, and
 * drawing uses React Native's core PanResponder — so this needs no rebuild.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Svg, { Image as SvgImage, Rect } from 'react-native-svg';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { colors } from '../src/theme';

// A box in NATURAL image-pixel coordinates (so it maps 1:1 onto the output).
type Box = { x: number; y: number; w: number; h: number };

export type RedactedImage = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  lastModified: number;
};

export default function ImageRedactorModal({
  visible,
  imageUri,
  onCancel,
  onApply,
}: {
  visible: boolean;
  imageUri: string | null;
  onCancel: () => void;
  onApply: (result: RedactedImage) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [layout, setLayout] = useState<{ w: number; h: number } | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  // Live rectangle being dragged, in DISPLAY coordinates (null when idle).
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const svgRef = useRef<any>(null);

  // Read the image's natural pixel size so we can map display → output coords.
  useEffect(() => {
    if (!visible || !imageUri) return;
    setBoxes([]);
    setDraft(null);
    setNatural(null);
    Image.getSize(
      imageUri,
      (w, h) => setNatural({ w, h }),
      () => setNatural(null),
    );
  }, [visible, imageUri]);

  // Contain-fit the image inside the available area; returns the drawn rect.
  const fit = useMemo(() => {
    if (!natural || !layout) return null;
    const scale = Math.min(layout.w / natural.w, layout.h / natural.h);
    const w = natural.w * scale;
    const h = natural.h * scale;
    return { w, h, offX: (layout.w - w) / 2, offY: (layout.h - h) / 2, scale };
  }, [natural, layout]);

  // Draw-to-cover: a drag creates a rectangle over the image area.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          if (!fit) return;
          const x = e.nativeEvent.locationX;
          const y = e.nativeEvent.locationY;
          setDraft({ x, y, w: 0, h: 0 });
        },
        onPanResponderMove: (e, g) => {
          setDraft((d) => (d ? { ...d, w: g.dx, h: g.dy } : d));
        },
        onPanResponderRelease: () => {
          setDraft((d) => {
            if (!d || !fit) return null;
            // Normalise (drags can go up/left → negative w/h).
            const x0 = Math.min(d.x, d.x + d.w);
            const y0 = Math.min(d.y, d.y + d.h);
            const bw = Math.abs(d.w);
            const bh = Math.abs(d.h);
            // Ignore stray taps; require a minimum drag.
            if (bw < 12 || bh < 12) return null;
            // Clamp to the image rect, then convert to natural pixel coords.
            const cx = Math.max(fit.offX, Math.min(x0, fit.offX + fit.w));
            const cy = Math.max(fit.offY, Math.min(y0, fit.offY + fit.h));
            const cw = Math.min(bw, fit.offX + fit.w - cx);
            const ch = Math.min(bh, fit.offY + fit.h - cy);
            const box: Box = {
              x: (cx - fit.offX) / fit.scale,
              y: (cy - fit.offY) / fit.scale,
              w: cw / fit.scale,
              h: ch / fit.scale,
            };
            setBoxes((prev) => [...prev, box]);
            return null;
          });
        },
      }),
    [fit],
  );

  const undo = () => setBoxes((b) => b.slice(0, -1));
  const clear = () => setBoxes([]);

  // Wrap a URI as our evidence file shape after reading its size.
  const asEvidence = async (uri: string): Promise<RedactedImage> => {
    const info = await FileSystem.getInfoAsync(uri);
    return {
      uri,
      name: 'evidence.jpg',
      mimeType: 'image/jpeg',
      size: info.exists ? info.size : 0,
      lastModified: Date.now(),
    };
  };

  // "Use photo": bake the boxes into a new flattened JPEG and hand it back.
  const apply = async () => {
    if (!natural || !imageUri || busy) return;
    // With no boxes drawn, "Use photo" is the same as skipping — just strip.
    if (boxes.length === 0) return skip();
    setBusy(true);
    try {
      const base64Png: string = await new Promise((resolve, reject) => {
        if (!svgRef.current?.toDataURL) return reject(new Error('no toDataURL'));
        // Rasterise the <Svg> (image + opaque rects) at full natural resolution.
        svgRef.current.toDataURL((data: string) => resolve(data), {
          width: natural.w,
          height: natural.h,
        });
      });
      // toDataURL returns bare base64 (no data: prefix) → write a temp PNG.
      const pngUri = `${FileSystem.cacheDirectory}redacted-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(pngUri, base64Png, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // Convert to a clean JPEG (smaller, and a final metadata-free re-encode).
      const jpeg = await ImageManipulator.manipulateAsync(pngUri, [], {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      onApply(await asEvidence(jpeg.uri));
    } catch {
      // On any failure we must NOT upload the original untouched (it may carry
      // GPS/faces) — back out so the reporter can try again deliberately.
      onCancel();
    } finally {
      setBusy(false);
    }
  };

  // "Skip": attach the photo WITHOUT covering anything, but still re-encode it
  // to a fresh JPEG so EXIF/GPS metadata is stripped. Passing no actions to
  // ImageManipulator re-encodes the pixels into a new file with no metadata
  // block — so we never store the raw original. If it fails we back out rather
  // than fall back to the untouched file.
  const skip = async () => {
    if (!imageUri || busy) return;
    setBusy(true);
    try {
      const jpeg = await ImageManipulator.manipulateAsync(imageUri, [], {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      onApply(await asEvidence(jpeg.uri));
    } catch {
      onCancel();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{t('report.redact.title')}</Text>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              hitSlop={10}
            >
              <Text style={styles.cancelX}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>{t('report.redact.hint')}</Text>
        </View>

        {/* Drawing surface. */}
        <View
          style={styles.canvas}
          onLayout={(e) =>
            setLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
          }
          {...pan.panHandlers}
        >
          {imageUri && fit ? (
            <>
              <Image
                source={{ uri: imageUri }}
                style={{
                  position: 'absolute',
                  left: fit.offX,
                  top: fit.offY,
                  width: fit.w,
                  height: fit.h,
                }}
                resizeMode="contain"
              />
              {/* Committed redactions (display coords = natural * scale). */}
              {boxes.map((b, i) => (
                <View
                  key={i}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: fit.offX + b.x * fit.scale,
                    top: fit.offY + b.y * fit.scale,
                    width: b.w * fit.scale,
                    height: b.h * fit.scale,
                    backgroundColor: '#000',
                  }}
                />
              ))}
              {/* Live drag preview. */}
              {draft ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: Math.min(draft.x, draft.x + draft.w),
                    top: Math.min(draft.y, draft.y + draft.h),
                    width: Math.abs(draft.w),
                    height: Math.abs(draft.h),
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    borderWidth: 1.5,
                    borderColor: colors.secondary,
                  }}
                />
              ) : null}
            </>
          ) : (
            <Text style={styles.loading}>{t('common.loading')}</Text>
          )}
        </View>

        {/* Offscreen SVG used only to rasterise the final flattened image. */}
        {imageUri && natural ? (
          <View style={styles.offscreen} pointerEvents="none">
            <Svg ref={svgRef} width={natural.w} height={natural.h}>
              <SvgImage
                href={{ uri: imageUri }}
                x={0}
                y={0}
                width={natural.w}
                height={natural.h}
                preserveAspectRatio="xMidYMid slice"
              />
              {boxes.map((b, i) => (
                <Rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="#000" />
              ))}
            </Svg>
          </View>
        ) : null}

        {/* Editing controls. */}
        <View style={styles.editRow}>
          <Pressable
            style={[styles.editBtn, boxes.length === 0 && styles.editBtnDisabled]}
            onPress={undo}
            disabled={boxes.length === 0}
          >
            <Text style={styles.editBtnText}>{t('report.redact.undo')}</Text>
          </Pressable>
          <Pressable
            style={[styles.editBtn, boxes.length === 0 && styles.editBtnDisabled]}
            onPress={clear}
            disabled={boxes.length === 0}
          >
            <Text style={styles.editBtnText}>{t('report.redact.clear')}</Text>
          </Pressable>
          <Text style={styles.count}>{t('report.redact.count', { count: boxes.length })}</Text>
        </View>

        {/* Footer: skip (attach, still stripped) / apply (attach redacted). */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={styles.secondaryBtn} onPress={skip} disabled={busy}>
            <Text style={styles.secondaryText}>{t('report.redact.skip')}</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={apply} disabled={busy}>
            <Text style={styles.primaryText}>
              {busy ? t('common.loading') : t('report.redact.apply')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.primary },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { color: colors.primaryText, fontSize: 18, fontWeight: '800', flex: 1, paddingRight: 12 },
  cancelX: { color: colors.primaryText, fontSize: 20, fontWeight: '800' },
  hint: { color: colors.primaryText, opacity: 0.9, fontSize: 13, marginTop: 4, lineHeight: 18 },
  canvas: { flex: 1, backgroundColor: '#111' },
  loading: { color: '#fff', textAlign: 'center', marginTop: 40 },
  // Kept in the tree (SVG must be mounted to rasterise) but visually hidden.
  offscreen: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999, top: -9999 },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#1b1b1b',
  },
  editBtn: {
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  editBtnDisabled: { opacity: 0.4 },
  editBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  count: { color: '#bbb', fontSize: 13, marginLeft: 'auto' },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#1b1b1b',
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#888',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: colors.onSecondary, fontSize: 16, fontWeight: '800' },
});
