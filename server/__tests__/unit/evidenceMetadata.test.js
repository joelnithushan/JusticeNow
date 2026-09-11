/**
 * Unit tests — evidence metadata stripping (anonymity hardening).
 *
 * We craft minimal but valid-enough container buffers with a KNOWN secret marker
 * embedded in a metadata segment/chunk, strip them, and assert the secret (and
 * the segment) is gone while the image data / structure survives. This proves
 * the GPS/EXIF/author leak is actually removed before storage.
 */

import { describe, it, expect } from 'vitest';
import { stripEvidenceMetadata } from '../../utils/evidenceMetadata.js';

const u16be = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};
const latin = (s) => Buffer.from(s, 'latin1');

describe('stripEvidenceMetadata — JPEG (EXIF/GPS)', () => {
  it('drops the APP1 EXIF segment and its GPS payload, keeps JFIF + image data', async () => {
    const soi = Buffer.from([0xff, 0xd8]);
    const app0Payload = Buffer.concat([latin('JFIF\0'), Buffer.from([1, 1, 0, 0, 1, 0, 1, 0, 0])]);
    const app0 = Buffer.concat([Buffer.from([0xff, 0xe0]), u16be(2 + app0Payload.length), app0Payload]);
    const exifPayload = Buffer.concat([latin('Exif\0\0'), latin('GPS_SECRET_LOCATION')]);
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), u16be(2 + exifPayload.length), exifPayload]);
    // SOS marker + arbitrary scan data + EOI (copied through verbatim).
    const scan = Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 0xff, 0xd9]);
    const jpeg = Buffer.concat([soi, app0, app1, scan]);

    const out = await stripEvidenceMetadata(jpeg, 'image/jpeg', 'photo.jpg');
    const text = out.toString('latin1');

    expect(out.subarray(0, 2)).toEqual(soi); // still a JPEG
    expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9])); // EOI intact
    expect(text).not.toContain('GPS_SECRET_LOCATION'); // GPS gone
    expect(text).not.toContain('Exif'); // EXIF marker gone
    expect(text).toContain('JFIF'); // APP0 kept
    expect(out.length).toBeLessThan(jpeg.length);
  });
});

describe('stripEvidenceMetadata — PNG (text/XMP)', () => {
  it('drops tEXt chunks, keeps IHDR/IEND', async () => {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      return Buffer.concat([len, latin(type), data, Buffer.alloc(4)]); // fake CRC ok for parse
    };
    const ihdr = chunk('IHDR', Buffer.alloc(13));
    const text = chunk('tEXt', Buffer.concat([latin('Comment\0'), latin('GPS_SECRET_PNG')]));
    const iend = chunk('IEND', Buffer.alloc(0));
    const png = Buffer.concat([sig, ihdr, text, iend]);

    const out = await stripEvidenceMetadata(png, 'image/png', 'e.png');
    const outText = out.toString('latin1');

    expect(out.subarray(0, 8)).toEqual(sig);
    expect(outText).not.toContain('GPS_SECRET_PNG');
    expect(outText).toContain('IHDR');
    expect(outText).toContain('IEND');
    expect(out.length).toBeLessThan(png.length);
  });
});

describe('stripEvidenceMetadata — WebP (EXIF chunk)', () => {
  it('drops the EXIF chunk and fixes the RIFF size', async () => {
    const webpChunk = (fourcc, data) => {
      const size = Buffer.alloc(4);
      size.writeUInt32LE(data.length);
      let out = Buffer.concat([latin(fourcc), size, data]);
      if (data.length % 2 === 1) out = Buffer.concat([out, Buffer.from([0])]);
      return out;
    };
    const vp8 = webpChunk('VP8 ', Buffer.from([1, 2, 3, 4]));
    const exif = webpChunk('EXIF', latin('GPS_SECRET_WEBP'));
    const body = Buffer.concat([vp8, exif]);
    const size = Buffer.alloc(4);
    size.writeUInt32LE(4 + body.length);
    const webp = Buffer.concat([latin('RIFF'), size, latin('WEBP'), body]);

    const out = await stripEvidenceMetadata(webp, 'image/webp', 'e.webp');
    const outText = out.toString('latin1');

    expect(outText.slice(0, 4)).toBe('RIFF');
    expect(outText.slice(8, 12)).toBe('WEBP');
    expect(outText).toContain('VP8 '); // image data kept
    expect(outText).not.toContain('GPS_SECRET_WEBP'); // EXIF gone
    expect(out.readUInt32LE(4)).toBe(4 + vp8.length); // RIFF size updated
  });
});

describe('stripEvidenceMetadata — PDF (document info)', () => {
  it('clears title/author/producer metadata', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.setAuthor('SECRET_AUTHOR_NAME');
    pdf.setTitle('SECRET_TITLE');
    pdf.setProducer('SECRET_PRODUCER');
    const buf = Buffer.from(await pdf.save({ useObjectStreams: false }));
    // Sanity: the metadata IS present before stripping.
    const original = await PDFDocument.load(buf);
    expect(original.getAuthor()).toBe('SECRET_AUTHOR_NAME');

    const clean = await stripEvidenceMetadata(buf, 'application/pdf', 'e.pdf');
    const reloaded = await PDFDocument.load(clean);
    // The sensitive user fields are cleared; the original producer is gone
    // (pdf-lib stamps its own tool name on save, which reveals nothing).
    expect(reloaded.getAuthor() || '').toBe('');
    expect(reloaded.getTitle() || '').toBe('');
    expect(reloaded.getSubject() || '').toBe('');
    expect(reloaded.getProducer() || '').not.toContain('SECRET_PRODUCER');
  });
});

describe('stripEvidenceMetadata — passthrough', () => {
  it('returns the original bytes for an unrecognised type', async () => {
    const buf = Buffer.from('not-an-image');
    const out = await stripEvidenceMetadata(buf, 'application/octet-stream', 'x.bin');
    expect(out).toEqual(buf);
  });
});
