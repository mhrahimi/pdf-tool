import { Buffer } from 'buffer';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import * as PDFLib from '@cantoo/pdf-lib';
import { zipSync, unzlibSync, zlibSync, strToU8 } from 'fflate';
import signpdf from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';

window.Buffer = Buffer;
window.pdfjsLib = pdfjsLib;
window.PDFLib = PDFLib;
window.fflate = { zipSync, unzlibSync, zlibSync, strToU8 };

// Local placeholder using the SAME @cantoo/pdf-lib instance as the app.
// @signpdf/placeholder-pdf-lib pulls a second pdf-lib copy; PDFName/PDFDict
// identity then breaks AcroForm Fields lookups (fields.push → undefined).
const {
  PDFArray, PDFName, PDFNumber, PDFString, PDFHexString, PDFInvalidObject, PDFDict,
} = PDFLib;
const BYTE_RANGE_PLACEHOLDER = '**********';
const SUBFILTER_ADOBE_PKCS7_DETACHED = 'adbe.pkcs7.detached';
const SIG_FLAGS = { SIGNATURES_EXIST: 1, APPEND_ONLY: 2 };
const ANNOT_PRINT = 4;

function pdflibAddPlaceholder({
  pdfDoc,
  pdfPage,
  reason,
  contactInfo,
  name,
  location,
  signingTime,
  signatureLength = 8192,
  byteRangePlaceholder = BYTE_RANGE_PLACEHOLDER,
  subFilter = SUBFILTER_ADOBE_PKCS7_DETACHED,
  widgetRect = [0, 0, 0, 0],
  appName,
}) {
  if (!pdfDoc && !pdfPage) throw new Error('PDFDoc or PDFPage must be set.');
  const doc = pdfDoc || pdfPage.doc;
  const page = pdfPage || doc.getPages()[0];

  const byteRange = PDFArray.withContext(doc.context);
  byteRange.push(PDFNumber.of(0));
  byteRange.push(PDFName.of(byteRangePlaceholder));
  byteRange.push(PDFName.of(byteRangePlaceholder));
  byteRange.push(PDFName.of(byteRangePlaceholder));

  const placeholder = PDFHexString.of(String.fromCharCode(0).repeat(signatureLength));
  const appBuild = appName ? { App: { Name: appName } } : {};
  const signatureDict = doc.context.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: subFilter,
    ByteRange: byteRange,
    Contents: placeholder,
    Reason: PDFString.of(reason || ''),
    M: PDFString.fromDate(signingTime || new Date()),
    ContactInfo: PDFString.of(contactInfo || ''),
    Name: PDFString.of(name || ''),
    Location: PDFString.of(location || ''),
    Prop_Build: { Filter: { Name: 'Adobe.PPKLite' }, ...appBuild },
  });
  const signatureBuffer = new Uint8Array(signatureDict.sizeInBytes());
  signatureDict.copyBytesInto(signatureBuffer, 0);
  const signatureDictRef = doc.context.register(PDFInvalidObject.of(signatureBuffer));

  const rect = PDFArray.withContext(doc.context);
  widgetRect.forEach(c => rect.push(PDFNumber.of(c)));
  const apStream = doc.context.formXObject([], { BBox: widgetRect, Resources: {} });
  const widgetDict = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    Rect: rect,
    V: signatureDictRef,
    T: PDFString.of('Signature1'),
    F: ANNOT_PRINT,
    P: page.ref,
    AP: { N: doc.context.register(apStream) },
  });
  const widgetDictRef = doc.context.register(widgetDict);

  let annotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (!annotations) annotations = doc.context.obj([]);
  annotations.push(widgetDictRef);
  page.node.set(PDFName.of('Annots'), annotations);

  let acroForm = doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  if (!acroForm) {
    acroForm = doc.context.obj({ Fields: doc.context.obj([]) });
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.register(acroForm));
  }
  let sigFlags = acroForm.has(PDFName.of('SigFlags'))
    ? acroForm.get(PDFName.of('SigFlags'))
    : PDFNumber.of(0);
  acroForm.set(PDFName.of('SigFlags'), PDFNumber.of(sigFlags.asNumber() | SIG_FLAGS.SIGNATURES_EXIST | SIG_FLAGS.APPEND_ONLY));
  let fields = acroForm.get(PDFName.of('Fields'));
  if (!fields) {
    fields = doc.context.obj([]);
    acroForm.set(PDFName.of('Fields'), fields);
  }
  fields.push(widgetDictRef);
}

window.folioSign = {
  pdflibAddPlaceholder,
  async sign(pdfBytes, p12Bytes, passphrase) {
    const pdfBuf = Buffer.from(pdfBytes);
    const signer = new P12Signer(Buffer.from(p12Bytes), { passphrase: passphrase || '' });
    const out = await signpdf.sign(pdfBuf, signer);
    // Copy out of Buffer/shared memory so later pdf.js loads can't detach it.
    return new Uint8Array(out instanceof Uint8Array ? out : new Uint8Array(out));
  },
};
