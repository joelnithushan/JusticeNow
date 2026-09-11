/**
 * JusticeNow — Evidence metadata stripping (anonymity hardening).
 *
 * WHY THIS EXISTS (threat model): a photo a reporter uploads as evidence almost
 * always carries hidden EXIF metadata — GPS coordinates, camera serial number,
 * and an exact capture timestamp. Storing that verbatim could DEANONYMISE the
 * very person the app exists to protect. So before any evidence file reaches
 * storage we strip identifying metadata from it.
 *
 * DESIGN: pure-JS, no native/image dependencies — we parse the container format
 * and drop the metadata segments/chunks, copying the image data through
 * untouched (no re-encode, no quality loss). Supported formats mirror the
 * allowed evidence types:
 *   - JPEG: drop APP1–APP15 (EXIF/XMP incl. GPS) and COM comment markers.
 *   - PNG:  drop tEXt/zTXt/iTXt (text + XMP), eXIf, and tIME chunks.
 *   - WebP: drop EXIF and 'XMP ' chunks and clear their VP8X flag bits.
 *   - PDF:  best-effort — cleared via pdf-lib IF installed (optional dep).
 *
 * FAIL MODE: if a recognised file cannot be parsed (corrupt/edge case) we return
 * the ORIGINAL bytes rather than reject a valid report — the report flow must not
 * break. This is a documented best-effort trade-off; standard camera JPEGs (the
 * common GPS-leak case) parse and strip cleanly.
 *
 * PRIVACY: never log file bytes or metadata values. This module logs nothing.
 */

'use strict';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// PNG ancillary chunks that can carry identifying text/metadata.
const PNG_DROP_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

/** JPEG: rebuild the stream, dropping APP1–APP15 (EXIF/XMP) and COM markers. */
function stripJpeg(buf) {
  if (buf.length < 2 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf; // not JPEG
  const out = [buf.subarray(0, 2)]; // SOI
  let pos = 2;
  while (pos < buf.length) {
    // Advance over any 0xFF fill bytes to the next marker byte.
    let p = pos;
    while (p < buf.length && buf[p] === 0xff) p++;
    if (p >= buf.length) {
      out.push(buf.subarray(pos));
      break;
    }
    const marker = buf[p];
    const markerStart = p - 1; // the 0xFF that precedes the marker byte

    // SOS begins entropy-coded image data → copy the rest verbatim and stop.
    // EOI ends the image. Standalone markers (RSTn/TEM) carry no length.
    if (marker === 0xda || marker === 0xd9) {
      out.push(buf.subarray(markerStart));
      break;
    }

    const lenPos = p + 1;
    if (lenPos + 1 >= buf.length) {
      out.push(buf.subarray(pos));
      break;
    }
    const segLen = buf.readUInt16BE(lenPos); // includes the 2 length bytes
    const segEnd = lenPos + segLen;
    if (segEnd > buf.length) {
      out.push(buf.subarray(pos));
      break;
    }

    const isAppMeta = marker >= 0xe1 && marker <= 0xef; // APP1..APP15
    const isComment = marker === 0xfe; // COM
    if (!isAppMeta && !isComment) {
      out.push(buf.subarray(markerStart, segEnd)); // keep (e.g. APP0/JFIF, DQT, SOF)
    }
    pos = segEnd;
  }
  return Buffer.concat(out);
}

/** PNG: copy the signature + all chunks except the metadata-bearing ones. */
function stripPng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return buf;
  const out = [buf.subarray(0, 8)];
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const chunkEnd = pos + 12 + len; // 4 len + 4 type + len data + 4 CRC
    if (chunkEnd > buf.length) {
      out.push(buf.subarray(pos));
      break;
    }
    if (!PNG_DROP_CHUNKS.has(type)) {
      out.push(buf.subarray(pos, chunkEnd)); // verbatim → CRC stays valid
    }
    pos = chunkEnd;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

/** WebP: drop EXIF/XMP RIFF chunks, clear their VP8X flags, fix the RIFF size. */
function stripWebp(buf) {
  if (
    buf.length < 12 ||
    buf.toString('latin1', 0, 4) !== 'RIFF' ||
    buf.toString('latin1', 8, 12) !== 'WEBP'
  ) {
    return buf;
  }
  const kept = [];
  let pos = 12;
  while (pos + 8 <= buf.length) {
    const fourcc = buf.toString('latin1', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    let end = pos + 8 + size;
    if (size % 2 === 1) end += 1; // chunks are padded to an even size
    if (end > buf.length) end = buf.length;

    if (fourcc !== 'EXIF' && fourcc !== 'XMP ') {
      let chunk = buf.subarray(pos, end);
      if (fourcc === 'VP8X' && chunk.length > 8) {
        // Clear the EXIF (0x08) and XMP (0x04) flag bits in the flags byte.
        chunk = Buffer.from(chunk);
        chunk[8] = chunk[8] & ~0x0c;
      }
      kept.push(chunk);
    }
    pos = end;
  }
  const body = Buffer.concat(kept);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + body.length, 4); // size of 'WEBP' + chunk data
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

/** PDF: strip document metadata via pdf-lib IF it is installed (optional dep). */
async function stripPdf(buf) {
  let PDFDocument;
  try {
    ({ PDFDocument } = require('pdf-lib'));
  } catch {
    return buf; // pdf-lib not installed → leave the PDF untouched (documented).
  }
  const pdf = await PDFDocument.load(buf);
  pdf.setTitle('');
  pdf.setAuthor('');
  pdf.setSubject('');
  pdf.setKeywords([]);
  pdf.setProducer('');
  pdf.setCreator('');
  // Zero the timestamps to a fixed epoch so they carry no capture time.
  const epoch = new Date(0);
  pdf.setCreationDate(epoch);
  pdf.setModificationDate(epoch);
  // NOTE: on save, pdf-lib stamps its OWN Producer ("pdf-lib …") and a ModDate of
  // now. Those reveal nothing about the reporter (tool name + processing time) —
  // the sensitive user fields (author/title/subject/keywords/creation date) are
  // the ones we cleared above, and they stay cleared.
  const bytes = await pdf.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

/**
 * Strip identifying metadata from an evidence file. Returns a cleaned Buffer,
 * or the original bytes if the type is unrecognised or parsing fails (so a valid
 * report is never blocked). Dispatch is by MIME type with an extension fallback.
 *
 * @param {Buffer} buffer   the raw uploaded bytes
 * @param {string} mimetype the reported MIME type (may be empty)
 * @param {string} [name]   the original filename, used only as a type fallback
 * @returns {Promise<Buffer>} the metadata-stripped bytes (best effort)
 */
async function stripEvidenceMetadata(buffer, mimetype, name = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return buffer;
  const mt = String(mimetype || '').toLowerCase();
  const ext = String(name || '').toLowerCase();
  const is = (mimeFrag, ...exts) =>
    mt.includes(mimeFrag) || exts.some((e) => ext.endsWith(e));

  try {
    if (is('jpeg', '.jpg', '.jpeg') || mt.includes('jpg')) return stripJpeg(buffer);
    if (is('png', '.png')) return stripPng(buffer);
    if (is('webp', '.webp')) return stripWebp(buffer);
    if (is('pdf', '.pdf')) return await stripPdf(buffer);
  } catch {
    // Best-effort: a parse failure must not block a legitimate report.
    return buffer;
  }
  return buffer; // unknown type → unchanged (the upload validator gates types)
}

module.exports = {
  stripEvidenceMetadata,
  // Exported for focused unit tests.
  stripJpeg,
  stripPng,
  stripWebp,
};
