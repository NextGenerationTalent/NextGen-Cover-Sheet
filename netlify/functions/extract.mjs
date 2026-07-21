// Netlify Function: /api/extract
// Accepts multipart form data: cv (file), notes, roleTitle, client, consultant
// Returns: { candidateData, cvBase64, cvMimeType, cvOriginalName }
//
// TWO-PASS ARCHITECTURE:
//   Pass 1 — notes-only call  → salary, package, notice, availability, motivation, consultant notes
//   Pass 2 — CV-only call     → name, headline, location, education, sector, strengths
//   Merge both results into final candidateData object.
//
// This guarantees Claude cannot pull salary/package data from the CV because
// the CV is physically absent from Pass 1.

import { Buffer } from "buffer";

const MAX_SIZE = 5.5 * 1024 * 1024;

// ─── Multipart parser ─────────────────────────────────────────────────────────

function parseMultipart(body, contentType) {
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
  if (!boundaryMatch) throw new Error("No boundary found in Content-Type");
  const boundary = boundaryMatch[1];

  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, "base64");
  const delimiter = Buffer.from(`\r\n--${boundary}`);
  const closeDelimiter = Buffer.from(`\r\n--${boundary}--`);

  const fields = {};
  let file = null;

  const startBoundary = Buffer.from(`--${boundary}\r\n`);
  let pos = buf.indexOf(startBoundary);
  if (pos === -1) throw new Error("Could not find start boundary");
  pos += startBoundary.length;

  while (pos < buf.length) {
    const headerEnd = buf.indexOf(Buffer.from("\r\n\r\n"), pos);
    if (headerEnd === -1) break;

    const headerStr = buf.slice(pos, headerEnd).toString("utf8");
    const bodyStart = headerEnd + 4;

    let bodyEnd = buf.indexOf(delimiter, bodyStart);
    if (bodyEnd === -1) bodyEnd = buf.indexOf(closeDelimiter, bodyStart);
    if (bodyEnd === -1) bodyEnd = buf.length;

    const partBody = buf.slice(bodyStart, bodyEnd);

    const dispositionMatch = headerStr.match(/Content-Disposition:[^\r\n]*name="([^"]+)"/i);
    const filenameMatch    = headerStr.match(/Content-Disposition:[^\r\n]*filename="([^"]+)"/i);
    const mimeMatch        = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

    if (dispositionMatch) {
      const name = dispositionMatch[1];
      if (filenameMatch) {
        file = {
          fieldname:    name,
          originalname: filenameMatch[1],
          mimetype:     mimeMatch ? mimeMatch[1].trim() : "application/octet-stream",
          buffer:       partBody,
          size:         partBody.length,
        };
      } else {
        fields[name] = partBody.toString("utf8");
      }
    }

    pos = bodyEnd + delimiter.length;
    if (buf.slice(bodyEnd, bodyEnd + closeDelimiter.length).equals(closeDelimiter)) break;
    pos += 2;
  }

  return { fields, file };
}

// ─── CV text extraction ───────────────────────────────────────────────────────

async function extractTextFromPDF(buffer) {
  const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
  const data = await pdfParse(buffer);
  return data.text || "";
}

async function extractTextFromWord(buffer) {
  const mammoth = await import("mammoth");
  const result  = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

// ─── Claude API helper ────────────────────────────────────────────────────────

async function callClaude(systemPrompt, userMessage, apiKey) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "x-api-key":       apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-6",
      max_tokens: 4096,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const result  = await
