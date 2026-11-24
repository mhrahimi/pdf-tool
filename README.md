# The PDF Tool — a light, private PDF toolkit

The PDF Tool runs entirely in the browser. Nothing is uploaded: every file is read, edited and
saved on your own device.

**Tools:** View (with search, bookmarks, document details and a font/encoding report) ·
Fill form · Merge · Split · Organize pages · Crop · Sign · Edit · Watermark & page numbers ·
Compress · PDF → Image · Image → PDF.

## Use it

- **GitHub Pages:** push to `main`, then in the repo go to **Settings → Pages → Source: GitHub Actions**.
  The workflow builds and deploys `dist/artifact/` (PWA-installable when served over HTTPS).
- **Local single file:** open `dist/folio.html` in any modern browser (Chrome, Edge, Firefox, Safari 16.4+).
  It's one file (~2.9 MB) and works offline.
- **Local hosted build:** serve `dist/artifact/` (for example `npx serve dist/artifact`) to try the PWA.

## Build it
```
npm install
npm run build          # → dist/folio.html and dist/artifact/*
python3 test/make_samples.py test/samples
python3 test/e2e.py     # headless Chrome, checks every tool's output
```

## How it's put together
- `src/js/00-core.js` — file library, PDF loading (password prompts), rendering, PDFsam-style
  page ranges (`1-3, 5, 8-, last, odd, even`), downloads, dialogs, geometry for rotated pages.
- `src/js/10-shell.js` — tool registry, home dashboard, the shared tool frame
  (work area · settings panel · run bar), results with “Continue with…”.
- One file per tool group in `src/js/` (viewer, merge, split, organize, crop, compress,
  convert, sign/edit, watermark, forms).
- `src/manifest.webmanifest` + `src/sw.js` + `src/icons/` — PWA install support for the hosted build.
- Libraries: pdf.js 6.5 (rendering, text, CJK character maps), @cantoo/pdf-lib 2.11
  (editing, encrypted input), fflate (zip/deflate). Signature fonts: Dancing Script,
  Great Vibes, Caveat (SIL OFL).

Design ideas borrowed from PDFsam: a dashboard of single-purpose tools, the same
input → settings → run layout everywhere, page-range syntax with clear validation messages,
per-file page ranges and bookmark handling in Merge, split modes (every N, after pages,
by bookmarks), remembered settings, and a keyboard shortcut to run (Ctrl/⌘+Enter).
