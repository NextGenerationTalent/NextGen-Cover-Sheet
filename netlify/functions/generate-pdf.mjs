// Netlify Function: /api/generate-pdf
// Accepts JSON: { candidateData, cvBase64, cvMimeType, roleTitle, client, consultant, date }
// Returns: PDF binary (application/pdf)

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Buffer } from "buffer";

// ─── Brand colours ────────────────────────────────────────────────────────────
const BLACK     = rgb(0.08, 0.08, 0.10);
const GOLD      = rgb(0.78, 0.62, 0.25);
const DARK_GREY = rgb(0.22, 0.22, 0.25);
const MID_GREY  = rgb(0.45, 0.45, 0.50);
const LIGHT_BG  = rgb(0.97, 0.97, 0.97);
const WHITE     = rgb(1, 1, 1);

// ─── Text wrap helper ─────────────────────────────────────────────────────────
function wrapText(text, font, fontSize, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    try {
      if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
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
  if (!text || !text.trim()) return;
  const clean = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ");
  try {
    page.drawText(clean, opts);
  } catch {
    // skip non-renderable characters
  }
}

// ─── Cover sheet page builder ─────────────────────────────────────────────────
async function buildCoverPage(pdfDoc, data, roleTitle, client, consultant, date) {
  const page = pdfDoc.addPage([595, 842]); // A4
  const W = 595;

  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // ── Header band ──────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 792, width: W, height: 50, color: BLACK });
  safeText(page, "NEXT GENERATION", {
    x: 36, y: 820, size: 13, font: fontBold, color: WHITE,
  });
  safeText(page, "RECRUITMENT", {
    x: 36, y: 806, size: 7.5, font: fontReg, color: GOLD,
  });
  safeText(page, "CANDIDATE COVER SHEET", {
    x: 370, y: 820, size: 8, font: fontReg, color: rgb(0.7, 0.7, 0.7),
  });
  safeText(page, date, {
    x: 370, y: 808, size: 8, font: fontReg, color: rgb(0.7, 0.7, 0.7),
  });

  // ── Gold accent line ──────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 790, width: W, height: 2, color: GOLD });

  // ── Candidate name + headline ─────────────────────────────────────────────
  safeText(page, data.name || "Candidate Name", {
    x: 36, y: 762, size: 22, font: fontBold, color: BLACK,
  });
  safeText(page, data.headline || "", {
    x: 36, y: 744, size: 10, font: fontOblique, color: GOLD,
  });

  // ── Meta row (location | rights | education) ──────────────────────────────
  let metaX = 36;
  const metaItems = [
    data.location,
    data.euWorkRights,
    data.education,
  ].filter(Boolean);
  for (let i = 0; i < metaItems.length; i++) {
    if (i > 0) {
      safeText(page, "·", { x: metaX, y: 728, size: 8, font: fontReg, color: MID_GREY });
      metaX += 10;
    }
    safeText(page, metaItems[i], { x: metaX, y: 728, size: 8, font: fontReg, color: DARK_GREY });
    try {
      metaX += fontReg.widthOfTextAtSize(metaItems[i], 8) + 6;
    } catch { metaX += 80; }
  }

  // ── Divider ───────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 36, y: 720, width: W - 72, height: 0.75, color: rgb(0.85, 0.85, 0.85) });

  // ── Submission info box ───────────────────────────────────────────────────
  page.drawRectangle({ x: 36, y: 680, width: W - 72, height: 34, color: LIGHT_BG, borderColor: rgb(0.88, 0.88, 0.88), borderWidth: 0.5 });
  const submFields = [
    { label: "ROLE", value: roleTitle },
    { label: "CLIENT", value: client },
    { label: "CONSULTANT", value: consultant },
  ];
  const colW = (W - 72) / 3;
  submFields.forEach(({ label, value }, i) => {
    const cx = 36 + i * colW + 10;
    safeText(page, label, { x: cx, y: 703, size: 6.5, font: fontBold, color: MID_GREY });
    safeText(page, value || "—", { x: cx, y: 691, size: 8.5, font: fontBold, color: BLACK });
  });

  let y = 665;

  // ── Professional Summary ──────────────────────────────────────────────────
  safeText(page, "PROFESSIONAL SUMMARY", { x: 36, y, size: 7, font: fontBold, color: GOLD });
  y -= 10;
  const summaryLines = wrapText(data.professionalSummary || "", fontReg, 9, W - 72);
  for (const line of summaryLines) {
    safeText(page, line, { x: 36, y, size: 9, font: fontReg, color: DARK_GREY });
    y -= 13;
  }
  y -= 6;

  // ── Sector Experience ─────────────────────────────────────────────────────
  safeText(page, "SECTOR EXPERIENCE", { x: 36, y, size: 7, font: fontBold, color: GOLD });
  y -= 11;
  let chipX = 36;
  const chips = (data.sectorExperience || []).slice(0, 8);
  for (const chip of chips) {
    let cw = 60;
    try { cw = fontReg.widthOfTextAtSize(chip, 8) + 14; } catch {}
    if (chipX + cw > W - 36) { chipX = 36; y -= 18; }
    page.drawRectangle({ x: chipX, y: y - 4, width: cw, height: 14, color: rgb(0.95, 0.90, 0.78), borderColor: GOLD, borderWidth: 0.5 });
    safeText(page, chip, { x: chipX + 7, y: y + 1, size: 8, font: fontReg, color: DARK_GREY });
    chipX += cw + 6;
  }
  y -= 22;

  y -= 8; // gap after sector chips

  // ── Two-column layout ─────────────────────────────────────────────────────
  const colLeft = 36;
  const colRight = 310;
  const colWide = 258;
  let yL = y;
  let yR = y;

  // Left: Key Strengths
  safeText(page, "KEY STRENGTHS", { x: colLeft, y: yL, size: 7, font: fontBold, color: GOLD });
  yL -= 11;
  const strengths = Array.isArray(data.keyStrengths) ? data.keyStrengths : [];
  for (const s of strengths.slice(0, 5)) {
    if (!s || !s.trim()) continue;
    // Use '> ' prefix (ASCII safe for Helvetica) instead of ▸
    const lines = wrapText(`> ${s}`, fontReg, 8.5, colWide);
    for (const l of lines) {
      safeText(page, l, { x: colLeft, y: yL, size: 8.5, font: fontReg, color: DARK_GREY });
      yL -= 12;
    }
    yL -= 2;
  }

  // Right: Package
  safeText(page, "CURRENT PACKAGE", { x: colRight, y: yR, size: 7, font: fontBold, color: GOLD });
  yR -= 11;
  const pkgRows = [
    ["Base Salary", data.currentBase],
    ["Bonus", data.currentBonus],
    ["Pension", data.currentPension],
    ["Health", data.currentHealth],
    ["Car / Allowance", data.currentCar],
    ["Annual Leave", data.currentLeave],
    ["Other", data.currentOther],
  ].filter(([, v]) => v);
  for (const [label, value] of pkgRows) {
    safeText(page, `${label}:`, { x: colRight, y: yR, size: 8, font: fontBold, color: DARK_GREY });
    const valLines = wrapText(value, fontReg, 8, 140);
    safeText(page, valLines[0], { x: colRight + 80, y: yR, size: 8, font: fontReg, color: DARK_GREY });
    yR -= 12;
  }
  yR -= 4;
  safeText(page, "TARGET SALARY", { x: colRight, y: yR, size: 7, font: fontBold, color: GOLD });
  yR -= 11;
  safeText(page, data.targetSalary || "—", { x: colRight, y: yR, size: 9, font: fontBold, color: BLACK });
  if (data.targetNotes) {
    yR -= 12;
    const targetNoteLines = wrapText(data.targetNotes, fontOblique, 7.5, colWide);
    for (const tnl of targetNoteLines.slice(0, 2)) {
      safeText(page, tnl, { x: colRight, y: yR, size: 7.5, font: fontOblique, color: MID_GREY });
      yR -= 11;
    }
  }

  y = Math.min(yL, yR) - 10;

  // ── Availability ──────────────────────────────────────────────────────────
  page.drawRectangle({ x: 36, y: y - 4, width: W - 72, height: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 14;
  safeText(page, "AVAILABILITY", { x: 36, y, size: 7, font: fontBold, color: GOLD });
  y -= 12;
  // Draw notice period on its own line
  safeText(page, `Notice Period: ${data.noticePeriod || "—"}`, { x: 36, y, size: 8.5, font: fontReg, color: DARK_GREY });
  y -= 13;
  // Draw interview availability on its own separate line below
  if (data.interviewAvailability && data.interviewAvailability.trim() && data.interviewAvailability.toLowerCase() !== 'not specified in notes') {
    safeText(page, `Interview Availability: ${data.interviewAvailability}`, { x: 36, y, size: 8.5, font: fontReg, color: DARK_GREY });
    y -= 13;
  }
  y -= 4;

  // ── Motivation for Move ───────────────────────────────────────────────────
  safeText(page, "MOTIVATION FOR MOVE", { x: 36, y, size: 7, font: fontBold, color: GOLD });
  y -= 11;
  const motLines = wrapText(data.motivationForMove || "", fontReg, 8.5, W - 72);
  for (const line of motLines.slice(0, 6)) {
    safeText(page, line, { x: 36, y, size: 8.5, font: fontReg, color: DARK_GREY });
    y -= 12;
  }
  y -= 8;

  // ── Consultant Notes ──────────────────────────────────────────────────────
  if (y > 80) {
    safeText(page, "CONSULTANT INTERVIEW NOTES", { x: 36, y, size: 7, font: fontBold, color: GOLD });
    y -= 11;
    for (const note of (data.consultantNotes || []).slice(0, 5)) {
      if (y < 50) break;
      const headLines = wrapText(`${note.headline}:`, fontBold, 8.5, W - 72);
      safeText(page, headLines[0], { x: 36, y, size: 8.5, font: fontBold, color: BLACK });
      y -= 12;
      const detailLines = wrapText(note.detail || "", fontReg, 8, W - 72);
      for (const dl of detailLines) {
        if (y < 50) break;
        safeText(page, dl, { x: 36, y, size: 8, font: fontReg, color: DARK_GREY });
        y -= 11;
      }
      y -= 4;
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: 28, color: BLACK });
  safeText(page, "NEXT GENERATION RECRUITMENT  ·  CONFIDENTIAL", {
    x: 36, y: 10, size: 7, font: fontReg, color: rgb(0.5, 0.5, 0.5),
  });
  safeText(page, "nextgenrecruitment.ie", {
    x: W - 120, y: 10, size: 7, font: fontReg, color: GOLD,
  });
}

// ─── Personal detail redaction helper ─────────────────────────────────────────────────────
function isPersonalDetailLine(line) {
  const t = line.trim();
  // Phone numbers (various formats)
  if (/(?:\+?\d[\s\-.]?){7,15}/.test(t) && /\d{4,}/.test(t)) return true;
  // Email addresses
  if (/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(t)) return true;
  // LinkedIn URLs
  if (/linkedin\.com\/in\//i.test(t)) return true;
  // Lines that are ONLY a phone/address (short lines with digits and common separators)
  if (/^[\d\s\(\)\+\-\.]{7,20}$/.test(t)) return true;
  return false;
}

// ─── Unified CV text renderer (paginated, personal details redacted) ─────────────────────
async function appendCVTextPages(pdfDoc, cvText) {
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Split into lines, filter blank and personal detail lines
  const rawLines = cvText.split("\n").filter((l) => l.trim() && !isPersonalDetailLine(l));

  // Also inline-redact any remaining emails/phones within lines that passed the filter
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

  // Pre-wrap all lines
  const allWrapped = [];
  for (const line of lines) {
    const wrapped = wrapText(line, fontReg, 9, TEXT_WIDTH);
    allWrapped.push(...wrapped);
    allWrapped.push(""); // blank line between paragraphs
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
      safeText(currentPage, "CURRICULUM VITAE", { x: MARGIN, y: ty, size: 13, font: fontBold, color: BLACK });
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
    // For PDFs: copy original pages directly (preserves formatting), then draw white
    // rectangles over the personal detail area at the top of page 1.
    // For Word: render as structured text with personal details stripped.
    if (cvBase64 && cvMimeType) {
      const cvBuffer = Buffer.from(cvBase64, "base64");
      try {
        if (cvMimeType === "application/pdf") {
          // Load the original CV PDF
          const cvPdfDoc = await PDFDocument.load(cvBuffer, { ignoreEncryption: true });
          const pageCount = cvPdfDoc.getPageCount();
          // Copy all pages into our combined PDF
          const copiedPages = await pdfDoc.copyPages(cvPdfDoc, [...Array(pageCount).keys()]);
          copiedPages.forEach((p) => pdfDoc.addPage(p));

          // Redact personal details on the FIRST CV page by drawing white rectangles
          // over the top contact-info band (typically first 80-120px from top of page)
          // We also scan for email/phone patterns in the extracted text to determine
          // how many lines to cover.
          const firstCvPage = copiedPages[0];
          const { height: pageH, width: pageW } = firstCvPage.getSize();

          // Extract text to detect how deep the contact block goes
          let contactBlockHeight = 80; // default: cover top 80pt
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
            // Estimate: each line ~14pt, contact block starts at top
            contactBlockHeight = Math.max(60, (lastContactLine + 2) * 14);
          } catch { /* use default */ }

          // Draw white rectangle over contact area at top of first CV page
          firstCvPage.drawRectangle({
            x: 0,
            y: pageH - contactBlockHeight,
            width: pageW,
            height: contactBlockHeight,
            color: WHITE,
          });
          // Also draw a thin gold line as a visual separator
          firstCvPage.drawRectangle({
            x: 0,
            y: pageH - contactBlockHeight,
            width: pageW,
            height: 1,
            color: GOLD,
          });
        } else {
          // Word: extract text and render with personal details stripped
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ buffer: cvBuffer });
          const cvText = result.value || "";
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

    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    const safeName   = (candidateData.name || "Candidate").replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
    const safeClient = (client || "Client").replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
    const filename   = `CoverSheet_${safeName}_${safeClient}.pdf`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
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
