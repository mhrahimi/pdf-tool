import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import * as PDFLib from '@cantoo/pdf-lib';
import { zipSync, unzlibSync, zlibSync, strToU8 } from 'fflate';
window.pdfjsLib = pdfjsLib;
window.PDFLib = PDFLib;
window.fflate = { zipSync, unzlibSync, zlibSync, strToU8 };
