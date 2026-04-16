# Next Generation Cover Sheet Generator — v3.0

A branded recruitment cover sheet generator for **Next Generation Recruitment**. Upload a candidate CV (PDF or Word), add interview notes, and the tool uses Claude AI to extract structured data, populate a fully editable review form, then generate a combined PDF (branded cover sheet + original CV) ready for Tracker and client submission.

---

## How it works

1. **Upload** — Drag-and-drop a candidate CV (PDF or Word, max 5.5 MB)
2. **Notes** — Paste recruiter interview notes, Fireflies transcripts, or salary bullets
3. **Extract** — Claude AI parses the CV and notes into structured fields
4. **Review** — Edit every field before generating the PDF
5. **Download** — One-click combined PDF: branded cover sheet (page 1) + CV (pages 2+)
6. **Copy** — Tracker ATS notes and submission email draft, ready to paste

---

## Deploying to Netlify

### Prerequisites

- A [Netlify account](https://netlify.com) (free tier works)
- An [Anthropic API key](https://console.anthropic.com) for Claude AI
- Node.js 18+ installed locally

### Option A — Deploy via Netlify UI (easiest)

1. Push this folder to a GitHub repository
2. Log in to Netlify → **Add new site** → **Import an existing project**
3. Connect your GitHub repo
4. Netlify auto-detects the `netlify.toml` — build settings are pre-configured
5. Go to **Site settings → Environment variables** and add:
   ```
   ANTHROPIC_API_KEY = sk-ant-xxxxxxxxxxxxxxxx
   ```
6. Click **Deploy site**

### Option B — Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init        # link to your Netlify account
netlify env:set ANTHROPIC_API_KEY sk-ant-xxxxxxxxxxxxxxxx
netlify deploy --prod
```

### Option C — Drag-and-drop (no Git)

1. Run `npm install && npm run build` locally
2. Drag the `dist/` folder to [app.netlify.com/drop](https://app.netlify.com/drop)
3. Add the `ANTHROPIC_API_KEY` environment variable in Site settings
4. **Note:** Netlify Functions won't work with drag-and-drop — use Option A or B for full functionality

---

## Local development

```bash
npm install
npm install -g netlify-cli

# Set your API key
netlify env:set ANTHROPIC_API_KEY sk-ant-xxxxxxxxxxxxxxxx

# Start local dev server (Vite + Netlify Functions)
netlify dev
```

Open [http://localhost:8888](http://localhost:8888)

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ Yes | Claude API key from console.anthropic.com |

---

## Project structure

```
netlify/
  functions/
    extract.mjs        ← CV parsing + Claude AI extraction
    generate-pdf.mjs   ← Branded PDF generation (pdf-lib)
src/
  components/
    coversheet/
      UploadStep.jsx   ← Step 1: file upload + form
      ReviewStep.jsx   ← Step 2: editable review + sticky banner
      SuccessStep.jsx  ← Step 3: Tracker notes + email copy
  types/
    coversheet.ts      ← Shared TypeScript types
  App.jsx              ← Main app orchestration
  main.jsx             ← React entry point
  index.css            ← Premium design tokens
index.html             ← Vite entry
vite.config.js         ← Vite config with dev proxy
netlify.toml           ← Netlify build + function config
```

---

## Notes

- **CV size limit:** 5.5 MB. For larger files, compress at [ilovepdf.com](https://ilovepdf.com)
- **PDF CVs are recommended** — Word files are rendered as clean text pages
- **All fields are editable** before the PDF is generated
- **Salary data** — include specific figures in the Interview Notes field; Claude uses notes as the primary source for package data
- **Filename format:** `CoverSheet_[CandidateName]_[Client].pdf`
