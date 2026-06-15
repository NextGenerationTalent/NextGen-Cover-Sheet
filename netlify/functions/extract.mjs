// Netlify Function: /api/extract
// Accepts multipart form data: cv (file), notes, roleTitle, client, consultant
// Returns: { candidateData, cvBase64, cvMimeType, cvOriginalName }

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

  // Split on boundary
  const startBoundary = Buffer.from(`--${boundary}\r\n`);
  let pos = buf.indexOf(startBoundary);
  if (pos === -1) throw new Error("Could not find start boundary");
  pos += startBoundary.length;

  while (pos < buf.length) {
    // Find end of this part's headers
    const headerEnd = buf.indexOf(Buffer.from("\r\n\r\n"), pos);
    if (headerEnd === -1) break;

    const headerStr = buf.slice(pos, headerEnd).toString("utf8");
    const bodyStart = headerEnd + 4;

    // Find next boundary
    let bodyEnd = buf.indexOf(delimiter, bodyStart);
    if (bodyEnd === -1) {
      bodyEnd = buf.indexOf(closeDelimiter, bodyStart);
    }
    if (bodyEnd === -1) bodyEnd = buf.length;

    const partBody = buf.slice(bodyStart, bodyEnd);

    // Parse headers
    const dispositionMatch = headerStr.match(/Content-Disposition:[^\r\n]*name="([^"]+)"/i);
    const filenameMatch = headerStr.match(/Content-Disposition:[^\r\n]*filename="([^"]+)"/i);
    const mimeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

    if (dispositionMatch) {
      const name = dispositionMatch[1];
      if (filenameMatch) {
        // File field
        file = {
          fieldname: name,
          originalname: filenameMatch[1],
          mimetype: mimeMatch ? mimeMatch[1].trim() : "application/octet-stream",
          buffer: partBody,
          size: partBody.length,
        };
      } else {
        // Text field
        fields[name] = partBody.toString("utf8");
      }
    }

    // Advance past delimiter
    pos = bodyEnd + delimiter.length;
    if (buf.slice(bodyEnd, bodyEnd + closeDelimiter.length).equals(closeDelimiter)) break;
    pos += 2; // skip \r\n after boundary
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
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

// ─── LLM extraction ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a recruitment data extraction engine. Output ONLY a raw JSON object — no markdown, no explanation, no code fences.

CRITICAL RULES:

RULE 1 — SALARY & PACKAGE (MANDATORY):
The RECRUITER NOTES are the ONLY valid source for every salary and package field.
You MUST extract salary data from the RECRUITER NOTES section.
You MUST NOT use the CV for salary, package, or compensation data under any circumstances.
If the recruiter notes contain a base salary figure, you MUST put it in currentBase.
If the recruiter notes contain a bonus, you MUST put it in currentBonus.
If the recruiter notes contain a pension, you MUST put it in currentPension.
If the recruiter notes contain health insurance, you MUST put it in currentHealth.
If the recruiter notes contain a car allowance, you MUST put it in currentCar.
If the recruiter notes contain annual leave, you MUST put it in currentLeave.
If the recruiter notes contain a total package figure, you MUST put it in currentOther.
If the recruiter notes contain a target salary, you MUST put it in targetSalary.
Leaving any of these fields blank when the data exists in the notes is a critical failure.

RULE 2 — KEY STRENGTHS (MANDATORY):
Return exactly 5 non-empty strings in keyStrengths.
Extract from the CV work history. Never return fewer than 5.

RULE 3 — CONSULTANT NOTES (MANDATORY):
These 5 bullets are written BY the recruiter FOR the hiring manager.
Base them ONLY on the RECRUITER NOTES — what the recruiter learned in the interview.
Do NOT mention any CV/notes mismatch. Do NOT flag discrepancies between CV and notes.
Write 5 professional third-person observations covering:
(1) candidate's strongest selling point from the notes
(2) current salary and package from the notes
(3) notice period and availability from the notes
(4) motivation for move from the notes
(5) one practical consideration for the hiring manager

RULE 4 — MOTIVATION FOR MOVE:
Write this from the recruiter's perspective based on the notes, referencing the client and role.

RULE 5 — CV FIELDS:
Use the CV ONLY for: name, headline, location, education, work history, sector experience, key strengths, EU work rights, professional summary.`;

async function extractWithLLM(cvText, notes, roleTitle, client) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in environment variables.");

  const hasNotes = notes && notes.trim().length > 10;

  const userMessage = `ROLE: ${roleTitle || "Not specified"}
CLIENT: ${client || "Not specified"}

=== RECRUITER INTERVIEW NOTES ===
IMPORTANT: Read these notes carefully FIRST. Every salary, package, notice period, availability, motivation, and consultant observation MUST come from here.
${hasNotes ? notes : "(No recruiter notes provided — salary fields should be left blank)"}
=== END RECRUITER NOTES ===

Now extract the following from the RECRUITER NOTES above:
- currentBase: base salary (e.g. "€92,000") — MUST come from notes
- currentBonus: bonus (e.g. "12% annual bonus") — MUST come from notes
- currentPension: pension (e.g. "7% employer contribution") — MUST come from notes
- currentHealth: health insurance (e.g. "Private healthcare, family cover") — MUST come from notes
- currentCar: car/allowance (e.g. "€8,000 car allowance") — MUST come from notes
- currentLeave: annual leave (e.g. "25 days") — MUST come from notes
- currentOther: total package or other benefits — MUST come from notes
- targetSalary: target salary range — MUST come from notes
- targetNotes: max 8 words on flexibility — MUST come from notes
- noticePeriod: notice period — MUST come from notes
- interviewAvailability: interview availability — MUST come from notes
- motivationForMove: why moving, referencing ${client || "the client"} and the ${roleTitle || "role"} — MUST come from notes
- consultantNotes: 5 bullets from recruiter perspective — MUST come from notes, NOT the CV

=== CV TEXT ===
Use the CV ONLY for: name, headline, location, euWorkRights, education, professionalSummary, sectorExperience, keyStrengths.
Do NOT use the CV for any salary, package, or compensation data.
${cvText}
=== END CV ===

Return ONLY this JSON object, no other text:
{
  "name": "",
  "headline": "",
  "location": "",
  "euWorkRights": "",
  "education": "",
  "professionalSummary": "",
  "sectorExperience": [],
  "keyStrengths": [],
  "currentBase": "",
  "currentBonus": "",
  "currentPension": "",
  "currentHealth": "",
  "currentCar": "",
  "currentLeave": "",
  "currentOther": "",
  "targetSalary": "",
  "targetNotes": "",
  "noticePeriod": "",
  "interviewAvailability": "",
  "motivationForMove": "",
  "consultantNotes": [{"headline": "", "detail": ""}]
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const result = await response.json();
  const content = result.content?.[0]?.text;
  if (!content) throw new Error("Claude returned empty response");

  // Extract JSON from response (Claude may wrap it in markdown)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse JSON from Claude response. Click Extract again.");

  return JSON.parse(jsonMatch[0]);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const contentType = event.headers["content-type"] || event.headers["Content-Type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Request must be multipart/form-data" }),
      };
    }

    // Netlify passes body as base64 when isBase64Encoded is true
    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body || "", "utf8");

    const { fields, file } = parseMultipart(bodyBuffer, contentType);

    const notes = fields.notes || "";
    const roleTitle = fields.roleTitle || "";
    const client = fields.client || "";
    const consultant = fields.consultant || "";

    if (!file) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No CV file uploaded. Please attach a PDF or Word file." }),
      };
    }

    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Only PDF and Word (.doc, .docx) files are accepted." }),
      };
    }

    if (file.size > MAX_SIZE) {
      return {
        statusCode: 413,
        body: JSON.stringify({
          error: "CV file exceeds 5.5 MB. Please compress it (ilovepdf.com) or paste the CV text into the notes field.",
        }),
      };
    }

    // Extract text
    let cvText = "";
    try {
      if (file.mimetype === "application/pdf") {
        cvText = await extractTextFromPDF(file.buffer);
      } else {
        cvText = await extractTextFromWord(file.buffer);
      }
    } catch (err) {
      return {
        statusCode: 422,
        body: JSON.stringify({
          error: `Could not extract text from CV: ${err.message}. Try converting to PDF and re-uploading.`,
        }),
      };
    }

    if (!cvText.trim()) {
      return {
        statusCode: 422,
        body: JSON.stringify({
          error: "CV text was empty or unreadable. Try a PDF version or paste the CV text into the notes field.",
        }),
      };
    }

    // Extract with Claude
    let candidateData;
    try {
      candidateData = await extractWithLLM(cvText, notes, roleTitle, client);
    } catch (err) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: `Could not parse AI response: ${err.message}. Click Extract again — it usually succeeds on retry.`,
        }),
      };
    }

    // Return CV as base64 for later PDF merge (avoids S3 dependency)
    const cvBase64 = file.buffer.toString("base64");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateData,
        cvBase64,
        cvMimeType: file.mimetype,
        cvOriginalName: file.originalname,
      }),
    };
  } catch (err) {
    console.error("[extract]", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Server error: ${err.message}` }),
    };
  }
};
