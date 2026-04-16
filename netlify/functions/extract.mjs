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

const SYSTEM_PROMPT = `You are a recruitment data extraction engine. Your ONLY job is to extract structured JSON. You must follow these rules without exception:

1. SALARY & PACKAGE — The recruiter interview notes are the SOLE source for all salary and package fields. If the notes mention a base salary, bonus, pension, health, car allowance, leave, or total package — you MUST populate those fields with the exact figures from the notes. Do not leave them blank if the data exists in the notes. Do not use CV data for salary unless the notes contain nothing at all.

2. KEY STRENGTHS — You MUST return exactly 5 non-empty strings. Extract the 5 strongest professional capabilities from the CV work history. Never return an empty array or fewer than 5 items.

3. CONSULTANT NOTES — These 5 bullets are written BY the recruiter FOR the hiring manager. They must be based on what the recruiter learned in the interview (from the RECRUITER NOTES section). Do NOT analyse whether the CV and notes match different people. Do NOT comment on discrepancies. Simply write 5 professional recruiter observations covering: (1) strongest selling point, (2) salary/package, (3) availability, (4) motivation for move, (5) one flag or consideration. Write in third person about the candidate.

4. Return ONLY a raw JSON object. No markdown, no explanation, no code fences.`;

async function extractWithLLM(cvText, notes, roleTitle, client) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in environment variables.");

  const hasNotes = notes && notes.trim().length > 10;

  const userMessage = `=== CV TEXT (use for: name, headline, location, education, work history, sector experience, key strengths, EU work rights) ===
${cvText}
=== END CV ===

=== RECRUITER INTERVIEW NOTES (use for: ALL salary/package fields, targetSalary, targetNotes, noticePeriod, interviewAvailability, motivationForMove, consultantNotes) ===
${hasNotes ? notes : "(No recruiter notes provided — use CV data only)"}
=== END RECRUITER NOTES ===

ROLE: ${roleTitle || "Not specified"}
CLIENT: ${client || "Not specified"}

SALARY EXTRACTION INSTRUCTIONS — read the recruiter notes above and populate these fields:
- currentBase: the base salary figure mentioned (e.g. "€92,000")
- currentBonus: the bonus mentioned (e.g. "12% annual bonus")
- currentPension: the pension mentioned (e.g. "7% employer contribution")
- currentHealth: health insurance mentioned (e.g. "Private healthcare family cover")
- currentCar: car or car allowance mentioned (e.g. "€8,000 car allowance")
- currentLeave: annual leave days mentioned (e.g. "25 days")
- currentOther: total package or other benefits (e.g. "Total package circa €115,000")
- targetSalary: target salary range from notes (e.g. "€105,000 – €120,000")
- targetNotes: max 8 words on flexibility (e.g. "Flexible for right scope and leadership")

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
