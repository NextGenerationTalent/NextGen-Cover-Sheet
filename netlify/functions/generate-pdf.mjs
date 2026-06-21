// generate-pdf.mjs
// Accepts JSON: { candidateData, cvBase64, cvMimeType, roleTitle, client, consultant, date }
// Returns: { pdfBase64, filename }
//
// LAYOUT — premium single-column, A4:
//   1.  Header band (black) — "NEXT GENERATION" left, "CANDIDATE COVER SHEET" + date right
//   2.  Candidate name · headline (italic gold) · meta row (location · EU rights · education)
//   3.  Submission info box (light grey, Role | Client | Consultant, with dividers)
//   4.  Sector Experience chips (cream bg, tan border — outlined style)
//   5.  Key Strengths (full-width, ">" bullets)
//   6.  Current Package strip — 6 cells (BLACK bg, gold labels, white values)
//   7.  Expected Package label + bottom band (BLACK bg, 3 cells: Availability | Motivation | Expected Salary)
//   8.  Consultant Interview Highlights (5-6 punchy lines)
//   9.  Footer band (black)

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Buffer } from "buffer";

// ─── Brand colours ─────────────────────────────────────────────────────────────
const NG_BLACK  = rgb(0, 0, 0);
const NG_WHITE  = rgb(1, 1, 1);
const NG_YELLOW = rgb(0.9725, 0.9176, 0.2039); // #f8ea34 exact brand yellow
const NG_LGREY  = rgb(0.929, 0.898, 0.898);    // #ece5e5
const NG_CREAM  = rgb(0.97, 0.95, 0.90);        // chip fill
const NG_CBORD  = rgb(0.75, 0.70, 0.55);        // chip border
const NG_MGREY  = rgb(0.50, 0.50, 0.50);
const NG_RULE   = rgb(0.82, 0.82, 0.82);
const NG_GOLD   = rgb(0.45, 0.38, 0.05);        // section labels / headline

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

// ─── Safe draw — strips control chars, handles euro symbol ───────────────────
function sd(page, text, opts) {
  if (!text || !String(text).trim()) return;
  // Standard PDF fonts don't support the euro glyph — replace with "EUR "
  const clean = String(text)
    .replace(/\u20ac/g, "EUR ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ");
  try { page.drawText(clean, opts); } catch {}
}

// ─── Section label ────────────────────────────────────────────────────────────
function sectionLabel(page, label, x, y, fBold) {
  sd(page, label.toUpperCase(), { x, y, size: 7, font: fBold, color: NG_GOLD });
  return y - 12;
}

// ─── Hairline rule ────────────────────────────────────────────────────────────
function rule(page, x, y, w) {
  page.drawRectangle({ x, y, width: w, height: 0.5, color: NG_RULE });
}

// ─── Current Package strip — 6 cells, BLACK background ───────────────────────
function drawPackageStrip(page, cells, y, fBold, fReg, W, M) {
  const STRIP_H = 44;
  const SW = W - M * 2;
  const cellW = SW / cells.length;
  const sy = y - STRIP_H;

  page.drawRectangle({ x: M, y: sy, width: SW, height: STRIP_H, color: NG_BLACK });
  // Top yellow accent line
  page.drawRectangle({ x: M, y: sy + STRIP_H - 1.5, width: SW, height: 1.5, color: NG_YELLOW });

  cells.forEach((cell, i) => {
    if (i > 0) page.drawRectangle({ x: M + i * cellW, y: sy, width: 0.75, height: STRIP_H, color: NG_YELLOW });
    const cx = M + i * cellW + 10;
    const val = cell.value && String(cell.value).trim() ? stripMd(cell.value) : "\u2014";
    const valColor = val === "\u2014" ? NG_MGREY : NG_WHITE;
    sd(page, cell.label.toUpperCase(), { x: cx, y: sy + STRIP_H - 15, size: 6, font: fBold, color: NG_YELLOW });
    // Wrap value to fit cell width
    const vLines = wrap(val, fBold, 9.5, cellW - 20);
    sd(page, vLines[0], { x: cx, y: sy + 11, size: 9.5, font: fBold, color: valColor });
  });

  return sy - 8;
}

// ─── Bottom band — BLACK, 3 equal cells ──────────────────────────────────────
// Availability | Motivation for Move | Expected Salary
function drawBottomBand(page, avail, motivation, expectedSalary, y, fBold, fReg, W, M) {
  const BAND_H = 62;
  const SW = W - M * 2;
  const cellW = SW / 3;
  const by = y - BAND_H;

  page.drawRectangle({ x: M, y: by, width: SW, height: BAND_H, color: NG_BLACK });
  page.drawRectangle({ x: M, y: by + BAND_H - 1.5, width: SW, height: 1.5, color: NG_YELLOW });

  const cells = [
    { label: "Availability",        value: avail },
    { label: "Motivation for Move", value: motivation },
    { label: "Expected Salary",     value: expectedSalary },
  ];

  cells.forEach((cell, i) => {
    const bx = M + i * cellW;
    if (i > 0) page.drawRectangle({ x: bx, y: by, width: 0.75, height: BAND_H, color: NG_YELLOW });
    const cx = bx + 10;
    sd(page, cell.label.toUpperCase(), { x: cx, y: by + BAND_H - 15, size: 6, font: fBold, color: NG_YELLOW });
    const val = cell.value && String(cell.value).trim() ? stripMd(cell.value) : "\u2014";
    const valColor = val === "\u2014" ? NG_MGREY : NG_WHITE;
    const vLines = wrap(val, fReg, 8, cellW - 20);
    let ty = by + BAND_H - 28;
    for (const l of vLines.slice(0, 3)) {
      sd(page, l, { x: cx, y: ty, size: 8, font: fReg, color: valColor });
      ty -= 12;
    }
  });

  return by - 14;
}

// ─── Cover sheet page builder ─────────────────────────────────────────────────
async function buildCoverPage(pdfDoc, data, roleTitle, client, consultant, date) {
  const page = pdfDoc.addPage([595, 842]); // A4
  const W  = 595;
  const M  = 40;
  const TW = W - M * 2;

  const fBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fObl  = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let y = 842;

  // ── 1. Header ──────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 796, width: W, height: 46, color: NG_BLACK });
  page.drawRectangle({ x: 0, y: 794, width: W, height: 2, color: NG_YELLOW });
  sd(page, "NEXT GENERATION", { x: M, y: 822, size: 12, font: fBold, color: NG_YELLOW });
  sd(page, "RECRUITMENT",     { x: M, y: 808, size: 7.5, font: fReg, color: NG_LGREY });
  sd(page, "CANDIDATE COVER SHEET", { x: W - M - 130, y: 824, size: 8, font: fBold, color: NG_LGREY });
  sd(page, date || "",              { x: W - M - 130, y: 811, size: 8, font: fReg, color: NG_LGREY });
  y = 786;

  // ── 2. Name + headline + meta ──────────────────────────────────────────────
  y -= 26;
  sd(page, stripMd(data.name || ""), { x: M, y, size: 24, font: fBold, color: NG_BLACK });
  y -= 20;
  sd(page, stripMd(data.headline || ""), { x: M, y, size: 10.5, font: fObl, color: NG_GOLD });
  y -= 14;
  const metaParts = [data.location, data.euWorkRights, data.education].filter(Boolean).map(stripMd);
  if (metaParts.length) {
    sd(page, metaParts.join("   \u00b7   "), { x: M, y, size: 8, font: fReg, color: NG_MGREY });
    y -= 14;
  }
  rule(page, M, y, TW);
  y -= 14;

  // ── 3. Submission info box ─────────────────────────────────────────────────
  const INFO_H = 44;
  page.drawRectangle({ x: M, y: y - INFO_H, width: TW, height: INFO_H, color: NG_LGREY });
  const colW = TW / 3;
  [
    { label: "ROLE",       value: roleTitle  || "" },
    { label: "CLIENT",     value: client     || "" },
    { label: "CONSULTANT", value: consultant || "" },
  ].forEach((col, i) => {
    const cx = M + i * colW + 12;
    if (i > 0) page.drawRectangle({ x: M + i * colW, y: y - INFO_H, width: 0.75, height: INFO_H, color: NG_RULE });
    sd(page, col.label, { x: cx, y: y - 14, size: 6.5, font: fBold, color: NG_MGREY });
    sd(page, stripMd(col.value), { x: cx, y: y - 32, size: 10, font: fBold, color: NG_BLACK });
  });
  y -= INFO_H + 18;

  // ── 4. Sector chips — cream bg, tan border ─────────────────────────────────
  if (data.sectorExperience && data.sectorExperience.length) {
    y = sectionLabel(page, "Sector Experience", M, y, fBold);
    y -= 4;
    let cx = M, rowY = y;
    for (const sector of data.sectorExperience) {
      const txt = stripMd(sector);
      let tw; try { tw = fReg.widthOfTextAtSize(txt, 8); } catch { tw = 80; }
      const cw = tw + 20;
      if (cx + cw > W - M) { cx = M; rowY -= 22; }
      page.drawRectangle({ x: cx, y: rowY - 16, width: cw, height: 16, color: NG_CREAM });
      page.drawRectangle({ x: cx, y: rowY - 16, width: cw, height: 0.75, color: NG_CBORD });
      page.drawRectangle({ x: cx, y: rowY,       width: cw, height: 0.75, color: NG_CBORD });
      page.drawRectangle({ x: cx, y: rowY - 16, width: 0.75, height: 16, color: NG_CBORD });
      page.drawRectangle({ x: cx + cw - 0.75, y: rowY - 16, width: 0.75, height: 16, color: NG_CBORD });
      sd(page, txt, { x: cx + 10, y: rowY - 11, size: 8, font: fReg, color: NG_BLACK });
      cx += cw + 6;
    }
    y = rowY - 16 - 16;
  }

  // ── 5. Key Strengths — ">" bullets ────────────────────────────────────────
  if (data.keyStrengths && data.keyStrengths.length) {
    rule(page, M, y, TW);
    y -= 14;
    y = sectionLabel(page, "Key Strengths", M, y, fBold);
    y -= 4;
    for (const strength of data.keyStrengths) {
      const txt = stripMd(strength);
      if (!txt) continue;
      const lines = wrap(txt, fReg, 9, TW - 16);
      sd(page, ">", { x: M, y, size: 9, font: fBold, color: NG_BLACK });
      for (const l of lines) {
        sd(page, l, { x: M + 14, y, size: 9, font: fReg, color: NG_BLACK });
        y -= 13;
      }
      y -= 2;
    }
    y -= 8;
  }

  // ── 6. Current Package strip — BLACK ──────────────────────────────────────
  rule(page, M, y, TW);
  y -= 14;
  y = sectionLabel(page, "Current Package", M, y, fBold);
  y -= 6;
  y = drawPackageStrip(page, [
    { label: "Base Salary",     value: data.currentBase    || "" },
    { label: "Bonus",           value: data.currentBonus   || "" },
    { label: "Pension",         value: data.currentPension || "" },
    { label: "Health",          value: data.currentHealth  || "" },
    { label: "Car / Allowance", value: data.currentCar     || "" },
    { label: "Annual Leave",    value: data.currentLeave   || "" },
  ], y, fBold, fReg, W, M);

  // ── 7. Expected Package label + bottom band ────────────────────────────────
  y -= 4;
  y = sectionLabel(page, "Expected Package", M, y, fBold);
  y -= 4;

  const availParts = [];
  if (data.noticePeriod)          availParts.push(`Notice: ${stripMd(data.noticePeriod)}`);
  if (data.interviewAvailability) availParts.push(`Interview: ${stripMd(data.interviewAvailability)}`);
  const availStr = availParts.join("  \u00b7  ") || "\u2014";

  y = drawBottomBand(
    page,
    availStr,
    data.motivationForMove || "",
    data.targetSalary || "",
    y, fBold, fReg, W, M
  );

  // ── 8. Consultant Interview Highlights ────────────────────────────────────
  const notes = Array.isArray(data.consultantNotes) ? data.consultantNotes : [];
  if (notes.length) {
    rule(page, M, y, TW);
    y -= 14;
    y = sectionLabel(page, "Consultant Interview Highlights", M, y, fBold);
    y -= 4;
    for (const note of notes) {
      const txt = stripMd(typeof note === "string" ? note : (note.detail || note.headline || ""));
      if (!txt) continue;
      const lines = wrap(txt, fReg, 8.5, TW - 14);
      sd(page, "\u00b7", { x: M, y, size: 9, font: fBold, color: NG_BLACK });
      for (const l of lines) {
        sd(page, l, { x: M + 12, y, size: 8.5, font: fReg, color: NG_BLACK });
        y -= 13;
      }
      y -= 4;
    }
  }

  // ── 9. Footer ──────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: 28, color: NG_BLACK });
  page.drawRectangle({ x: 0, y: 28, width: W, height: 1.5, color: NG_YELLOW });
  sd(page, "NEXT GENERATION RECRUITMENT  |  CONFIDENTIAL", { x: M, y: 10, size: 6.5, font: fReg, color: NG_LGREY });
  sd(page, "nextgenerationgroup.ie", { x: W - M - 90, y: 10, size: 6.5, font: fReg, color: NG_LGREY });
}

// ─── CV page builder ──────────────────────────────────────────────────────────
async function buildCVPages(pdfDoc, cvBase64, cvMimeType) {
  if (!cvBase64) return;
  try {
    const cvBytes = Buffer.from(cvBase64, "base64");
    if (cvMimeType === "application/pdf") {
      const cvDoc = await PDFDocument.load(cvBytes, { ignoreEncryption: true });
      const pages = await pdfDoc.copyPages(cvDoc, cvDoc.getPageIndices());
      for (const p of pages) pdfDoc.addPage(p);
    } else {
      const page = pdfDoc.addPage([595, 842]);
      let img;
      try {
        img = cvMimeType === "image/png"
          ? await pdfDoc.embedPng(cvBytes)
          : await pdfDoc.embedJpg(cvBytes);
      } catch { return; }
      const { width: iw, height: ih } = img.scale(1);
      const scale = Math.min(515 / iw, 762 / ih, 1);
      page.drawImage(img, { x: 40, y: 40, width: iw * scale, height: ih * scale });
    }
  } catch {}
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { candidateData = {}, cvBase64, cvMimeType, roleTitle, client, consultant, date } = body;

  try {
    const pdfDoc = await PDFDocument.create();
    await buildCoverPage(pdfDoc, candidateData, roleTitle, client, consultant, date);
    await buildCVPages(pdfDoc, cvBase64, cvMimeType);

    const pdfBytes  = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");
    const safeName  = (candidateData.name || "candidate").replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
    const filename  = `${safeName}_CoverSheet.pdf`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfBase64, filename }),
    };
  } catch (err) {
    console.error("generate-pdf error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
