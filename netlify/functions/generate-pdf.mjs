// Netlify Function: /api/generate-pdf
// Accepts JSON: { candidateData, cvBase64, cvMimeType, roleTitle, client, consultant, date }
// Returns: { pdfBase64, filename }
//
// LAYOUT (single-column, top to bottom):
//   1.  Header band (NG branding + date)
//   2.  Candidate name · headline · meta row (location · EU rights · education)
//   3.  Submission info box (Role | Client | Consultant)
//   4.  Sector Experience chips
//   5.  Key Strengths (full-width)
//   6.  Current Package strip — 6 cells always rendered (Base · Bonus · Pension · Health · Car · Leave)
//   7.  Expected Package strip — 1 cell (Target Base)
//   8.  Info cluster — 3 equal boxes (Availability | Motivation for Move | Expected Salary note)
//   9.  Consultant Interview Highlights (5-6 free-form punchy lines, no categories)
//   10. Footer band

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Buffer } from "buffer";

// ─── Brand colours ────────────────────────────────────────────────────────────
const BLACK     = rgb(0.08, 0.08, 0.10);
const GOLD      = rgb(0.78, 0.62, 0.25);
const GOLD_DARK = rgb(0.55, 0.43, 0.12);
const DARK_GREY = rgb(0.22, 0.22, 0.25);
const MID_GREY  = rgb(0.50, 0.50, 0.54);
const LIGHT_BG  = rgb(0.97, 0.97, 0.97);
const CHIP_BG   = rgb(0.95, 0.90, 0.78);
const WHITE     = rgb(1, 1, 1);
const RULE      = rgb(0.87, 0.87, 0.87);

// ─── Strip markdown ───────────────────────────────────────────────────────────
function stripMd(text) {
  if (!text) return "";
  return String(text)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[*\-]\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

// ─── Text wrap ────────────────────────────────────────────────────────────────
function wrap(text, font, size, maxW) {
  const words = (text || "").split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    try {
      if (font.widthOfTextAtSize(test, size) <= maxW) { cur = test; }
      else { if (cur) lines.push(cur); cur = w; }
    } catch { cur = test; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// ─── Safe draw ────────────────────────────────────────────────────────────────
function sd(page, text, opts) {
  if (!text || !String(text).trim()) return;
  const clean = String(text).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ");
  try { page.drawText(clean, opts); } catch {}
}

// ─── Section label ────────────────────────────────────────────────────────────
function sectionLabel(page, label, x, y, fontBold) {
  sd(page, label, { x, y, size: 6.5, font: fontBold, color: GOLD_DARK });
  return y - 10;
}

// ─── Horizontal rule ─────────────────────────────────────────────────────────
function rule(page, x, y, w) {
  page.drawRectangle({ x, y, width: w, height: 0.6, color: RULE });
}

// ─── 6-cell Current Package strip (always all 6 cells) ───────────────────────
// Each cell shows label + value (or em-dash placeholder if empty)
function drawPackageStrip(page, cells, y, fontBold, fontReg, W, M) {
  const STRIP_H = 42;
  const SW      = W - M * 2;
  const cellW   = SW / cells.length;
  const stripY  = y - STRIP_H;

  // Background
  page.drawRectangle({ x: M, y: stripY, width: SW, height: STRIP_H, color: CHIP_BG });
  // Border
  page.drawRectangle({ x: M, y: stripY, width: SW, height: STRIP_H, color: rgb(0,0,0,0), borderColor: GOLD, borderWidth: 0.6 });

  cells.forEach((cell, i) => {
    // Vertical divider
    if (i > 0) {
      page.drawRectangle({ x: M + i * cellW, y: stripY, width: 0.5, height: STRIP_H, color: GOLD });
    }
    const cx = M + i * cellW + 9;
    const val = cell.value && cell.value.trim() ? stripMd(cell.value) : "—";
    const valColor = val === "—" ? MID_GREY : BLACK;

    sd(page, cell.label.toUpperCase(), {
      x: cx, y: stripY + STRIP_H - 12,
      size: 5.5, font: fontBold, color: MID_GREY,
    });

    // Value — truncate to cell width
    const maxW = cellW - 18;
    const vLines = wrap(val, fontBold, 8.5, maxW);
    sd(page, vLines[0], {
      x: cx, y: stripY + 12,
      size: 8.5, font: fontBold, color: valColor,
    });
  });

  return stripY - 8;
}

// ─── 3-box info cluster ───────────────────────────────────────────────────────
// Three equal boxes side by side: Availability | Motivation for Move | Expected Salary
function drawInfoCluster(page, boxes, y, fontBold, fontReg, W, M) {
  const BOX_H = 52;
  const SW    = W - M * 2;
  const boxW  = SW / boxes.length;
  const boxY  = y - BOX_H;

  boxes.forEach((box, i) => {
    const bx = M + i * boxW;
    // Background alternating for subtle depth
    const bg = i % 2 === 0 ? LIGHT_BG : rgb(0.94, 0.94, 0.94);
    page.drawRectangle({ x: bx, y: boxY, width: boxW, height: BOX_H, color: bg });
    page.drawRectangle({ x: bx, y: boxY, width: boxW, height: BOX_H, color: rgb(0,0,0,0), borderColor: RULE, borderWidth: 0.6 });

    const cx = bx + 10;
    sd(page, box.label.toUpperCase(), {
      x: cx, y: boxY + BOX_H - 13,
      size: 5.5, font: fontBold, color: GOLD_DARK,
    });

    const val = box.value && box.value.trim() ? stripMd(box.value) : "—";
    const valColor = val === "—" ? MID_GREY : DARK_GREY;
    const maxW = boxW - 20;
    const vLines = wrap(val, fontReg, 8, maxW);
    let ty = boxY + BOX_H - 26;
    for (const l of vLines.slice(0, 3)) {
      sd(page, l, { x: cx, y: ty, size: 8, font: fontReg, color: valColor });
      ty -= 11;
    }
  });

  return boxY - 10;
}

// ─── Cover sheet page builder ─────────────────────────────────────────────────
async function buildCoverPage(pdfDoc, data, roleTitle, client, consultant, date) {
  const page = pdfDoc.addPage([595, 842]); // A4
  const W = 595;
  const M = 36;   // margin
  const TW = W - M * 2; // usable text width

  const fBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fObl  = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // ── 1. Header band ────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 792, width: W, height: 50, color: BLACK });
  sd(page, "NEXT GENERATION", { x: M, y: 821, size: 13, font: fBold, color: WHITE });
  sd(page, "RECRUITMENT",     { x: M, y: 806, size: 7.5, font: fReg, color: GOLD });
  sd(page, "CANDIDATE COVER SHEET", { x: 370, y: 821, size: 7.5, font: fReg, color: rgb(0.65, 0.65, 0.65) });
  sd(page, date,                    { x: 370, y: 808, size: 7.5, font: fReg, color: rgb(0.65, 0.65, 0.65) });
  // Gold accent line
  page.drawRectangle({ x: 0, y: 790, width: W, height: 2.5, color: GOLD });

  // ── 2. Candidate name + headline + meta ───────────────────────────────────
  sd(page, stripMd(data.name) || "Candidate Name", {
    x: M, y: 760, size: 24, font: fBold, color: BLACK,
  });
  if (data.headline) {
    sd(page, stripMd(data.headline), {
      x: M, y: 740, size: 10, font: fObl, color: GOLD,
    });
  }

  // Meta row
  let mx = M;
  const meta = [data.location, data.euWorkRights, data.education].filter(Boolean);
  for (let i = 0; i < meta.length; i++) {
    if (i > 0) {
      sd(page, "·", { x: mx, y: 724, size: 8, font: fReg, color: MID_GREY });
      mx += 10;
    }
    const item = stripMd(meta[i]);
    sd(page, item, { x: mx, y: 724, size: 8, font: fReg, color: DARK_GREY });
    try { mx += fReg.widthOfTextAtSize(item, 8) + 6; } catch { mx += 80; }
  }

  rule(page, M, 715, TW);

  // ── 3. Submission info box ────────────────────────────────────────────────
  page.drawRectangle({
    x: M, y: 675, width: TW, height: 34,
    color: LIGHT_BG, borderColor: RULE, borderWidth: 0.6,
  });
  [
    { label: "ROLE",       value: roleTitle },
    { label: "CLIENT",     value: client },
    { label: "CONSULTANT", value: consultant },
  ].forEach(({ label, value }, i) => {
    const cx = M + i * (TW / 3) + 10;
    sd(page, label,                     { x: cx, y: 698, size: 6,   font: fBold, color: MID_GREY });
    sd(page, stripMd(value) || "—",     { x: cx, y: 685, size: 8.5, font: fBold, color: BLACK });
  });

  let y = 660;

  // ── 4. Sector Experience chips ────────────────────────────────────────────
  y = sectionLabel(page, "SECTOR EXPERIENCE", M, y, fBold);
  let chipX = M;
  for (const chip of (data.sectorExperience || []).slice(0, 8)) {
    const t = stripMd(chip);
    let cw = 60;
    try { cw = fReg.widthOfTextAtSize(t, 7.5) + 14; } catch {}
    if (chipX + cw > W - M) { chipX = M; y -= 17; }
    page.drawRectangle({ x: chipX, y: y - 4, width: cw, height: 13, color: CHIP_BG, borderColor: GOLD, borderWidth: 0.5 });
    sd(page, t, { x: chipX + 7, y: y + 1, size: 7.5, font: fReg, color: DARK_GREY });
    chipX += cw + 5;
  }
  y -= 22;

  // ── 5. Key Strengths ──────────────────────────────────────────────────────
  y = sectionLabel(page, "KEY STRENGTHS", M, y, fBold);
  for (const s of (Array.isArray(data.keyStrengths) ? data.keyStrengths : []).slice(0, 5)) {
    if (!s || !s.trim() || y < 120) continue;
    for (const l of wrap(`> ${stripMd(s)}`, fReg, 8.5, TW)) {
      if (y < 120) break;
      sd(page, l, { x: M, y, size: 8.5, font: fReg, color: DARK_GREY });
      y -= 12;
    }
    y -= 2;
  }
  y -= 6;

  // ── 6. Current Package strip (always 6 cells) ─────────────────────────────
  y = sectionLabel(page, "CURRENT PACKAGE", M, y, fBold);
  y = drawPackageStrip(page, [
    { label: "Base Salary",    value: data.currentBase    },
    { label: "Bonus",          value: data.currentBonus   },
    { label: "Pension",        value: data.currentPension },
    { label: "Health",         value: data.currentHealth  },
    { label: "Car / Allowance",value: data.currentCar     },
    { label: "Annual Leave",   value: data.currentLeave   },
  ], y, fBold, fReg, W, M);

  // ── 7. Expected Package strip (1 cell — target base) ─────────────────────
  if (data.targetSalary && data.targetSalary.trim()) {
    y = sectionLabel(page, "EXPECTED PACKAGE", M, y, fBold);
    y = drawPackageStrip(page, [
      { label: "Target Base", value: data.targetSalary },
    ], y, fBold, fReg, W, M);
  }

  y -= 4;
  rule(page, M, y, TW);
  y -= 10;

  // ── 8. Info cluster: Availability | Motivation for Move | Expected Salary ─
  const availText = [
    data.noticePeriod && data.noticePeriod.trim() ? `Notice: ${stripMd(data.noticePeriod)}` : null,
    data.interviewAvailability && data.interviewAvailability.trim() &&
      data.interviewAvailability.toLowerCase() !== "not specified in notes"
      ? `Interview: ${stripMd(data.interviewAvailability)}`
      : null,
  ].filter(Boolean).join("  ·  ") || "—";

  y = drawInfoCluster(page, [
    { label: "Availability",       value: availText },
    { label: "Motivation for Move",value: data.motivationForMove || "" },
    { label: "Expected Salary",    value: data.targetSalary || "" },
  ], y, fBold, fReg, W, M);

  rule(page, M, y, TW);
  y -= 12;

  // ── 9. Consultant Interview Highlights ────────────────────────────────────
  if (data.consultantNotes && data.consultantNotes.length > 0 && y > 80) {
    y = sectionLabel(page, "CONSULTANT INTERVIEW HIGHLIGHTS", M, y, fBold);
    // Render as free-form punchy lines — no bold headlines, just the insight
    for (const note of data.consultantNotes.slice(0, 6)) {
      if (y < 50) break;
      // Support both string notes and {headline, detail} objects
      let line = "";
      if (typeof note === "string") {
        line = stripMd(note);
      } else {
        // Prefer detail if it's substantive, otherwise fall back to headline
        const detail   = stripMd(note.detail   || "");
        const headline = stripMd(note.headline || "");
        line = detail && detail.length > 10 ? detail : headline;
      }
      if (!line || !line.trim()) continue;
      const lines = wrap(`· ${line}`, fReg, 8.5, TW);
      for (const l of lines) {
        if (y < 50) break;
        sd(page, l, { x: M, y, size: 8.5, font: fReg, color: DARK_GREY });
        y -= 12;
      }
      y -= 3;
    }
  }

  // ── 10. Footer ────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: 30, color: BLACK });
  sd(page, "NEXT GENERATION RECRUITMENT  ·  CONFIDENTIAL", {
    x: M, y: 11, size: 6.5, font: fReg, color: rgb(0.50, 0.50, 0.50),
  });
  sd(page, "nextgenrecruitment.ie", {
    x: W - 118, y: 11, size: 6.5, font: fReg, color: GOLD,
  });
}

// ─── Personal detail redaction ────────────────────────────────────────────────
function isPersonalLine(line) {
  const t = line.trim();
  if (/(?:\+?\d[\s\-.]?){7,15}/.test(t) && /\d{4,}/.test(t)) return true;
  if (/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(t)) return true;
  if (/linkedin\.com\/in\//i.test(t)) return true;
  if (/^[\d\s\(\)\+\-\.]{7,20}$/.test(t)) return true;
  return false;
}

// ─── CV text renderer (Word fallback) ────────────────────────────────────────
async function appendCVTextPages(pdfDoc, cvText) {
  const fReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const lines = cvText.split("\n")
    .filter((l) => l.trim() && !isPersonalLine(l))
    .map((l) =>
      l
        .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, "[redacted]")
        .replace(/(?:\+?\d[\s\-.]?){7,15}/g, (m) => (m.replace(/\D/g, "").length >= 7 ? "[redacted]" : m))
        .replace(/linkedin\.com\/in\/[^\s]*/gi, "[redacted]")
    );

  const PAGE_TOP = 800, PAGE_BOTTOM = 50, LINE_H = 13, MAR = 36, TW = 523;
  const allWrapped = [];
  for (const line of lines) {
    allWrapped.push(...wrap(line, fReg, 9, TW));
    allWrapped.push("");
  }

  let page = pdfDoc.addPage([595, 842]);
  let ty = PAGE_TOP;
  let headerDrawn = false;

  for (const wl of allWrapped) {
    if (ty < PAGE_BOTTOM) {
      page = pdfDoc.addPage([595, 842]);
      ty = PAGE_TOP;
      headerDrawn = false;
    }
    if (!headerDrawn) {
      sd(page, "CURRICULUM VITAE", { x: MAR, y: ty, size: 13, font: fBold, color: BLACK });
      page.drawRectangle({ x: MAR, y: ty - 5, width: TW, height: 1.5, color: GOLD });
      ty -= 28;
      headerDrawn = true;
    }
    if (wl) sd(page, wl, { x: MAR, y: ty, size: 9, font: fReg, color: DARK_GREY });
    ty -= LINE_H;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { candidateData, cvBase64, cvMimeType, roleTitle, client, consultant, date } = body;

    if (!candidateData?.name?.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Candidate name is required. Please fill in the Name field before downloading." }),
      };
    }

    const pdfDoc = await PDFDocument.create();
    await buildCoverPage(pdfDoc, candidateData, roleTitle, client, consultant, date);

    if (cvBase64 && cvMimeType) {
      const cvBuffer = Buffer.from(cvBase64, "base64");
      try {
        if (cvMimeType === "application/pdf") {
          const cvPdf = await PDFDocument.load(cvBuffer, { ignoreEncryption: true });
          const copied = await pdfDoc.copyPages(cvPdf, [...Array(cvPdf.getPageCount()).keys()]);
          copied.forEach((p) => pdfDoc.addPage(p));

          // Redact personal details on first CV page
          const first = copied[0];
          const { height: pH, width: pW } = first.getSize();
          let blockH = 80;
          try {
            const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
            const parsed = await pdfParse(cvBuffer);
            const firstLines = (parsed.text || "").split("\n").slice(0, 20);
            let last = 0;
            firstLines.forEach((l, idx) => {
              if (
                /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(l) ||
                /(?:\+?\d[\s\-.]?){7,15}/.test(l) ||
                /linkedin\.com\/in\//i.test(l) ||
                /^[\d\s\(\)\+\-\.]{7,20}$/.test(l.trim())
              ) last = idx;
            });
            blockH = Math.max(60, (last + 2) * 14);
          } catch {}

          first.drawRectangle({ x: 0, y: pH - blockH, width: pW, height: blockH, color: WHITE });
          first.drawRectangle({ x: 0, y: pH - blockH, width: pW, height: 1, color: GOLD });
        } else {
          const mammoth = await import("mammoth");
          const { value: cvText } = await mammoth.extractRawText({ buffer: cvBuffer });
          if (cvText?.trim()) await appendCVTextPages(pdfDoc, cvText);
        }
      } catch (err) {
        console.error("[PDF] CV processing failed:", err);
        const fb = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fp = pdfDoc.addPage([595, 842]);
        fp.drawText("CV could not be embedded. Please attach separately.", {
          x: 36, y: 400, size: 10, font: fb, color: DARK_GREY,
        });
      }
    }

    const pdfBytes  = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");
    const safeName   = (candidateData.name || "Candidate").replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
    const safeClient = (client || "Client").replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfBase64, filename: `CoverSheet_${safeName}_${safeClient}.pdf` }),
    };
  } catch (err) {
    console.error("[generate-pdf]", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `PDF generation failed: ${err.message}` }),
    };
  }
};
