// Netlify Function: /api/generate-pdf
// Accepts JSON: { candidateData, cvBase64, cvMimeType, roleTitle, client, consultant, date }
// Returns: { pdfBase64, filename }
//
// LAYOUT (single-column, top to bottom):
//   1. Header band (NG branding)
//   2. Candidate name + headline + meta row (location · EU rights · education)
//   3. Submission info box (Role | Client | Consultant)
//   4. Sector Experience chips
//   5. Key Strengths (full-width, single column)
//   6. Current Package strip (horizontal cells: Base · Bonus · Pension · Health · Car · Leave)
//   7. Expected Package strip (single cell: Target Base)
//   8. Availability (Notice Period + Interview Availability)
//   9. Motivation for Move
//  10. Consultant Interview Notes
//  11. Footer band

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Buffer } from "buffer";

// ─── Brand colours ────────────────────────────────────────────────────────────
const BLACK     = rgb(0.08, 0.08, 0.10);
const GOLD      = rgb(0.78, 0.62, 0.25);
const DARK_GREY = rgb(0.22, 0.22, 0.25);
const MID_GREY  = rgb(0.45, 0.45, 0.50);
const LIGHT_BG  = rgb(0.97, 0.97, 0.97);
const CHIP_BG   = rgb(0.95, 0.90, 0.78);
const WHITE     = rgb(1, 1, 1);

// ─── Strip markdown from text ─────────────────────────────────────────────────
// pdf-lib renders raw characters — asterisks, hashes etc. must be stripped.
function stripMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")   // **bold**
    .replace(/\*([^*]+)\*/g, "$1")        // *italic*
    .replace(/^#{1,6}\s+/gm, "")          // # headings
    .replace(/^[*\-]\s+/gm, "")           // bullet list markers
    .replace(/`([^`]+)`/g, "$1")          // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [link](url)
    .trim();
}

// ─── Text wrap helper ─────────────────────────────────────────────────────────
function wrapText(text, font, fontSize, maxWidth) {
  const words = (text || "").split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    try {
      if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        // If a single word is wider than maxWidth, force it on its own line
        current = word;
      }
    } catch {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// ─── Safe text draw ───────────────────────────────────────────────────────────
function safeText(page, text, opts) {
  if (!text || !String(text).trim()) return;
  const clean = String(text)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ");
  try {
    page.drawText(clean, opts);
  } catch {
    // skip non-renderable characters silently
  }
}

// ─── Package strip renderer ───────────────────────────────────────────────────
// Draws a full-width horizontal strip with labelled cells.
// cells: [{ label, value }]  — cells with empty value are omitted.
// Returns the new y position after the strip.
function drawPackageStrip(page, cells, y, fontBold, fontReg, W, MARGIN) {
  const activeCells = cells.filter((c) => c.value && c.value.trim());
  if (activeCells.length === 0) return y;

  const STRIP_H    = 36;
  const STRIP_W    = W - MARGIN * 2;
  const cellW      = STRIP_W / activeCells.length;
  const stripY     = y - STRIP_H;

  // Background
  page.drawRectangle({
    x: MARGIN, y: stripY, width: STRIP_W, height: STRIP_H,
    color: CHIP_BG, borderColor: GOLD, borderWidth: 0.5,
  });

  // Vertical dividers between cells
  for (let i = 1; i < activeCells.length; i++) {
    page.drawRectangle({
      x: MARGIN + i * cellW, y: stripY, width: 0.5, height: STRIP_H,
      color: GOLD,
    });
  }

  // Cell content
  activeCells.forEach((cell, i) => {
    const cx = MARGIN + i * cellW + 8;
    safeText(page, cell.label.toUpperCase(), {
      x: cx, y: stripY + STRIP_H - 11,
      size: 6, font: fontBold, color: MID_GREY,
    });
    // Value — truncate to fit cell width
    const maxValW = cellW - 16;
    const valLines = wrapText(stripMarkdown(cell.value), fontReg, 8.5, maxValW);
    safeText(page, valLines[0], {
      x: cx, y: stripY + 10,
      size: 8.5, font: fontBold, color: BLACK,
    });
  });

  return stripY - 6; // return y below the strip with a small gap
}

// ─── Cover sheet page builder ─────────────────────────────────────────────────
async function buildCoverPage(pdfDoc, data, roleTitle, client, consultant, date) {
  const page = pdfDoc.addPage([595, 842]); // A4
  const W      = 595;
  const MARGIN = 36;
  const TW     = W - MARGIN * 2; // usable text width

  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // ── 1. Header band ────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 792, width: W, height: 50, color: BLACK });
  safeText(page, "NEXT GENERATION", {
    x: MARGIN, y: 820, size: 13, font: fontBold, color: WHITE,
  });
  safeText(page, "RECRUITMENT", {
    x: MARGIN, y: 806, size: 7.5, font: fontReg, color: GOLD,
  });
  safeText(page, "CANDIDATE COVER SHEET", {
    x: 370, y: 820, size: 8, font: fontReg, color: rgb(0.7, 0.7, 0.7),
  });
  safeText(page, date, {
    x: 370, y: 808, size: 8, font: fontReg, color: rgb(0.7, 0.7, 0.7),
  });
  // Gold accent line
  page.drawRectangle({ x: 0, y: 790, width: W, height: 2, color: GOLD });

  // ── 2. Candidate name + headline + meta row ───────────────────────────────
  safeText(page, stripMarkdown(data.name) || "Candidate Name", {
    x: MARGIN, y: 762, size: 22, font: fontBold, color: BLACK,
  });
  if (data.headline) {
    safeText(page, stripMarkdown(data.headline), {
      x: MARGIN, y: 744, size: 10, font: fontOblique, color: GOLD,
    });
  }

  // Meta row: location · euWorkRights · education
  let metaX = MARGIN;
  const metaItems = [data.location, data.euWorkRights, data.education].filter(Boolean);
  for (let i = 0; i < metaItems.length; i++) {
    if (i > 0) {
      safeText(page, "·", { x: metaX, y: 728, size: 8, font: fontReg, color: MID_GREY });
      metaX += 10;
    }
    const item = stripMarkdown(metaItems[i]);
    safeText(page, item, { x: metaX, y: 728, size: 8, font: fontReg, color: DARK_GREY });
    try { metaX += fontReg.widthOfTextAtSize(item, 8) + 6; } catch { metaX += 80; }
  }

  // Divider
  page.drawRectangle({ x: MARGIN, y: 720, width: TW, height: 0.75, color: rgb(0.85, 0.85, 0.85) });

  // ── 3. Submission info box ────────────────────────────────────────────────
  page.drawRectangle({
    x: MARGIN, y: 680, width: TW, height: 34,
    color: LIGHT_BG, borderColor: rgb(0.88, 0.88, 0.88), borderWidth: 0.5,
  });
  const submFields = [
    { label: "ROLE",       value: roleTitle },
    { label: "CLIENT",     value: client },
    { label: "CONSULTANT", value: consultant },
  ];
  const colW = TW / 3;
  submFields.forEach(({ label, value }, i) => {
    const cx = MARGIN + i * colW + 10;
    safeText(page, label, { x: cx, y: 703, size: 6.5, font: fontBold, color: MID_GREY });
    safeText(page, stripMarkdown(value) || "—", { x: cx, y: 691, size: 8.5, font: fontBold, color: BLACK });
  });

  let y = 665;

  // ── 4. Sector Experience chips ────────────────────────────────────────────
  safeText(page, "SECTOR EXPERIENCE", { x: MARGIN, y, size: 7, font: fontBold, color: GOLD });
  y -= 12;
  let chipX = MARGIN;
  const chips = (data.sectorExperience || []).slice(0, 8);
  for (const chip of chips) {
    const chipText = stripMarkdown(chip);
    let cw = 60;
    try { cw = fontReg.widthOfTextAtSize(chipText, 8) + 14; } catch {}
    if (chipX + cw > W - MARGIN) { chipX = MARGIN; y -= 18; }
    page.drawRectangle({
      x: chipX, y: y - 4, width: cw, height: 14,
      color: CHIP_BG, borderColor: GOLD, borderWidth: 0.5,
    });
    safeText(page, chipText, { x: chipX + 7, y: y + 1, size: 8, font: fontReg, color: DARK_GREY });
    chipX += cw + 6;
  }
  y -= 24; // clear gap after chips row

  // ── 5. Key Strengths (full-width single column) ───────────────────────────
  safeText(page, "KEY STRENGTHS", { x: MARGIN, y, size: 7, font: fontBold, color: GOLD });
  y -= 12;
  const strengths = Array.isArray(data.keyStrengths) ? data.keyStrengths : [];
  for (const s of strengths.slice(0, 5)) {
    if (!s || !s.trim()) continue;
    const lines = wrapText(`> ${stripMarkdown(s)}`, fontReg, 8.5, TW);
    for (const l of lines) {
      if (y < 80) break;
      safeText(page, l, { x: MARGIN, y, size: 8.5, font: fontReg, color: DARK_GREY });
      y -= 12;
    }
    y -= 2;
  }
  y -= 8;

  // ── 6. Current Package strip ──────────────────────────────────────────────
  const pkgCells = [
    { label: "Base Salary",   value: data.currentBase   },
    { label: "Bonus",         value: data.currentBonus  },
    { label: "Pension",       value: data.currentPension },
    { label: "Health",        value: data.currentHealth },
    { label: "Car / Allowance", value: data.currentCar  },
    { label: "Annual Leave",  value: data.currentLeave  },
  ];
  const hasPackage = pkgCells.some((c) => c.value && c.value.trim());
  if (hasPackage) {
    safeText(page, "CURRENT PACKAGE", { x: MARGIN, y, size: 7, font: fontBold, color: GOLD });
    y -= 8;
    y = drawPackageStrip(page, pkgCells, y, fontBold, fontReg, W, MARGIN);
  }

  // ── 7. Expected Package strip (target base only) ──────────────────────────
  if (data.targetSalary && data.targetSalary.trim()) {
    safeText(page, "EXPECTED PACKAGE", { x: MARGIN, y, size: 7, font: fontBold, color: GOLD });
    y -= 8;
    const expectedCells = [
      { label: "Target Base", value: data.targetSalary },
    ];
    if (data.targetNotes && data.targetNotes.trim()) {
      expectedCells.push({ label: "Notes", value: data.targetNotes });
    }
    y = drawPackageStrip(page, expectedCells, y, fontBold, fontReg, W, MARGIN);
  }
  y -= 4;

  // ── 8. Availability ───────────────────────────────────────────────────────
  page.drawRectangle({ x: MARGIN, y: y - 2, width: TW, height: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 14;
  safeText(page, "AVAILABILITY", { x: MARGIN, y, size: 7, font: fontBold, color: GOLD });
  y -= 12;
  safeText(page, `Notice Period: ${stripMarkdown(data.noticePeriod) || "—"}`, {
    x: MARGIN, y, size: 8.5, font: fontReg, color: DARK_GREY,
  });
  y -= 13;
  if (
    data.interviewAvailability &&
    data.interviewAvailability.trim() &&
    data.interviewAvailability.toLowerCase() !== "not specified in notes"
  ) {
    safeText(page, `Interview Availability: ${stripMarkdown(data.interviewAvailability)}`, {
      x: MARGIN, y, size: 8.5, font: fontReg, color: DARK_GREY,
    });
    y -= 13;
  }
  y -= 6;

  // ── 9. Motivation for Move ────────────────────────────────────────────────
  if (data.motivationForMove && data.motivationForMove.trim()) {
    safeText(page, "MOTIVATION FOR MOVE", { x: MARGIN, y, size: 7, font: fontBold, color: GOLD });
    y -= 12;
    const motLines = wrapText(stripMarkdown(data.motivationForMove), fontReg, 8.5, TW);
    for (const line of motLines.slice(0, 6)) {
      if (y < 80) break;
      safeText(page, line, { x: MARGIN, y, size: 8.5, font: fontReg, color: DARK_GREY });
      y -= 12;
    }
    y -= 8;
  }

  // ── 10. Consultant Interview Notes ────────────────────────────────────────
  if (y > 80 && data.consultantNotes && data.consultantNotes.length > 0) {
    safeText(page, "CONSULTANT INTERVIEW NOTES", { x: MARGIN, y, size: 7, font: fontBold, color: GOLD });
    y -= 12;
    for (const note of (data.consultantNotes || []).slice(0, 5)) {
      if (y < 50) break;
      const headline = stripMarkdown(note.headline || "");
      const detail   = stripMarkdown(note.detail   || "");
      if (headline) {
        const hLines = wrapText(`${headline}:`, fontBold, 8.5, TW);
        safeText(page, hLines[0], { x: MARGIN, y, size: 8.5, font: fontBold, color: BLACK });
        y -= 12;
      }
      if (detail) {
        const dLines = wrapText(detail, fontReg, 8, TW);
        for (const dl of dLines) {
          if (y < 50) break;
          safeText(page, dl, { x: MARGIN, y, size: 8, font: fontReg, color: DARK_GREY });
          y -= 11;
        }
      }
      y -= 4;
    }
  }

  // ── 11. Footer ────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: 28, color: BLACK });
  safeText(page, "NEXT GENERATION RECRUITMENT  ·  CONFIDENTIAL", {
    x: MARGIN, y: 10, size: 7, font: fontReg, color: rgb(0.5, 0.5, 0.5),
  });
  safeText(page, "nextgenrecruitment.ie", {
    x: W - 120, y: 10, size: 7, font: fontReg, color: GOLD,
  });
}

// ─── Personal detail redaction helper ────────────────────────────────────────
function isPersonalDetailLine(line) {
  const t = line.trim();
  if (/(?:\+?\d[\s\-.]?){7,15}/.test(t) && /\d{4,}/.test(t)) return true;
  if (/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(t)) return true;
  if (/linkedin\.com\/in\//i.test(t)) return true;
  if (/^[\d\s\(\)\+\-\.]{7,20}$/.test(t)) return true;
  return false;
}

// ─── CV text renderer (Word fallback) ────────────────────────────────────────
async function appendCVTextPages(pdfDoc, cvText) {
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const rawLines = cvText.split("\n").filter((l) => l.trim() && !isPersonalDetailLine(l));
  const lines = rawLines.map((l) =>
    l
      .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, "[redacted]")
      .replace(/(?:\+?\d[\s\-.]?){7,15}/g, (m) => (m.replace(/\D/g, "").length >= 7 ? "[redacted]" : m))
      .replace(/linkedin\.com\/in\/[^\s]*/gi, "[redacted]")
  );

  const PAGE_TOP    = 800;
  const PAGE_BOTTOM = 50;
  const LINE_H      = 13;
  const MARGIN      = 36;
  const TEXT_WIDTH  = 523;

  const allWrapped = [];
  for (const line of lines) {
    const wrapped = wrapText(line, fontReg, 9, TEXT_WIDTH);
    allWrapped.push(...wrapped);
    allWrapped.push("");
  }

  let currentPage = pdfDoc.addPage([595, 842]);
  let ty = PAGE_TOP;
  let headerDrawn = false;

  for (const wl of allWrapped) {
    if (ty < PAGE_BOTTOM) {
      currentPage = pdfDoc.addPage([595, 842]);
      ty = PAGE_TOP;
      headerDrawn = false;
    }
    if (!headerDrawn) {
      safeText(currentPage, "CURRICULUM VITAE", {
        x: MARGIN, y: ty, size: 13, font: fontBold, color: BLACK,
      });
      currentPage.drawRectangle({ x: MARGIN, y: ty - 5, width: TEXT_WIDTH, height: 1.5, color: GOLD });
      ty -= 28;
      headerDrawn = true;
    }
    if (wl) {
      safeText(currentPage, wl, { x: MARGIN, y: ty, size: 9, font: fontReg, color: DARK_GREY });
    }
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

    // Page 1: Cover sheet
    await buildCoverPage(pdfDoc, candidateData, roleTitle, client, consultant, date);

    // Page 2+: CV
    if (cvBase64 && cvMimeType) {
      const cvBuffer = Buffer.from(cvBase64, "base64");
      try {
        if (cvMimeType === "application/pdf") {
          const cvPdfDoc = await PDFDocument.load(cvBuffer, { ignoreEncryption: true });
          const pageCount = cvPdfDoc.getPageCount();
          const copiedPages = await pdfDoc.copyPages(cvPdfDoc, [...Array(pageCount).keys()]);
          copiedPages.forEach((p) => pdfDoc.addPage(p));

          // Redact personal details on first CV page
          const firstCvPage = copiedPages[0];
          const { height: pageH, width: pageW } = firstCvPage.getSize();

          let contactBlockHeight = 80;
          try {
            const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
            const parsed = await pdfParse(cvBuffer);
            const firstLines = (parsed.text || "").split("\n").slice(0, 20);
            let lastContactLine = 0;
            firstLines.forEach((line, idx) => {
              if (
                /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(line) ||
                /(?:\+?\d[\s\-.]?){7,15}/.test(line) ||
                /linkedin\.com\/in\//i.test(line) ||
                /^[\d\s\(\)\+\-\.]{7,20}$/.test(line.trim())
              ) {
                lastContactLine = idx;
              }
            });
            contactBlockHeight = Math.max(60, (lastContactLine + 2) * 14);
          } catch { /* use default */ }

          firstCvPage.drawRectangle({
            x: 0, y: pageH - contactBlockHeight,
            width: pageW, height: contactBlockHeight,
            color: WHITE,
          });
          firstCvPage.drawRectangle({
            x: 0, y: pageH - contactBlockHeight,
            width: pageW, height: 1,
            color: GOLD,
          });
        } else {
          // Word: render as text with personal details stripped
          const mammoth = await import("mammoth");
          const result  = await mammoth.extractRawText({ buffer: cvBuffer });
          const cvText  = result.value || "";
          if (cvText.trim()) {
            await appendCVTextPages(pdfDoc, cvText);
          }
        }
      } catch (err) {
        console.error("[PDF] CV processing failed:", err);
        const fallbackPage = pdfDoc.addPage([595, 842]);
        const fb = await pdfDoc.embedFont(StandardFonts.Helvetica);
        fallbackPage.drawText("CV could not be embedded. Please attach separately.", {
          x: 36, y: 400, size: 10, font: fb, color: DARK_GREY,
        });
      }
    }

    const pdfBytes  = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    const safeName   = (candidateData.name || "Candidate").replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
    const safeClient = (client || "Client").replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
    const filename   = `CoverSheet_${safeName}_${safeClient}.pdf`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfBase64, filename }),
    };
  } catch (err) {
    console.error("[generate-pdf]", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `PDF generation failed: ${err.message}` }),
    };
  }
};
