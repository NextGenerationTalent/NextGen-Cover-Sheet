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

  const result  = await response.json();
  const content = result.content?.[0]?.text;
  if (!content) throw new Error("Claude returned empty response");

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse JSON from Claude response. Click Extract again.");

  return JSON.parse(jsonMatch[0]);
}

// ─── PASS 1: Extract from interview notes ONLY ────────────────────────────────
// The CV is NOT sent in this call. Claude cannot fall back to CV data.

async function extractFromNotes(notes, roleTitle, client, apiKey) {
  const systemPrompt = `You are a recruitment assistant extracting structured data from a recruiter's interview notes.
Output ONLY a raw JSON object — no markdown, no explanation, no code fences.
Your ONLY source is the interview notes provided. Do not invent or assume any data not present in the notes.
If a piece of information is not mentioned in the notes, return an empty string "" for that field.`;

  const userMessage = `ROLE: ${roleTitle || "Not specified"}
CLIENT: ${client || "Not specified"}

RECRUITER INTERVIEW NOTES:
${notes.trim() || "(No notes provided)"}

Extract the following fields from the notes above. Return empty string "" for anything not mentioned.

{
  "currentBase": "candidate's current base salary (e.g. '€92,000')",
  "currentBonus": "bonus details (e.g. '12% annual bonus')",
  "currentPension": "pension details (e.g. '7% employer contribution')",
  "currentHealth": "health insurance (e.g. 'Private healthcare, family cover')",
  "currentCar": "car or car allowance (e.g. '€8,000 car allowance')",
  "currentLeave": "annual leave (e.g. '25 days')",
  "currentOther": "total package value or other notable benefits",
  "targetSalary": "candidate's target or desired salary range",
  "targetNotes": "brief note on salary flexibility — max 8 words",
  "noticePeriod": "notice period (e.g. '3 months')",
  "interviewAvailability": "when candidate is available for interview",
  "motivationForMove": "why the candidate wants to move, referencing ${client || "the client"} and the ${roleTitle || "role"} where relevant",
  "consultantNotes": [
    "highlight 1",
    "highlight 2",
    "highlight 3",
    "highlight 4",
    "highlight 5"
  ]
}

Rules for consultantNotes:
- Write 5-6 short punchy lines (1 sentence each) capturing the most valuable insights from the interview.
- These are qualitative highlights a hiring manager would want to know: personality, cultural fit, specific comments made, standout moments, or areas needing follow-up.
- DO NOT repeat structured data already captured in other fields: do not mention salary figures, notice period, or motivation for move as separate highlights.
- Write from the recruiter's perspective in third person (e.g. "Candidate demonstrated...", "Interviewer noted...").
- If the notes are thin, extract what you can and flag where more detail is needed.
- Return as a flat JSON array of plain strings, NOT objects with headline/detail keys.

Return ONLY the JSON object above, populated from the notes. No other text.`;

  return callClaude(systemPrompt, userMessage, apiKey);
}

// ─── PASS 2: Extract from CV ONLY ─────────────────────────────────────────────
// Interview notes are NOT sent in this call.

async function extractFromCV(cvText, roleTitle, client, apiKey) {
  const systemPrompt = `You are a recruitment assistant extracting structured candidate profile data from a CV.
Output ONLY a raw JSON object — no markdown, no explanation, no code fences.
Your ONLY source is the CV text provided. Do not invent or assume data not present in the CV.`;

  const userMessage = `ROLE: ${roleTitle || "Not specified"}
CLIENT: ${client || "Not specified"}

CV TEXT:
${cvText}

Extract the following fields from the CV above. Return empty string "" for anything not found.

{
  "name": "candidate's full name",
  "headline": "professional headline or current job title — max 10 words",
  "location": "candidate's location (city/country)",
  "euWorkRights": "EU work rights status (e.g. 'Irish Citizen', 'EU National', 'Stamp 4')",
  "education": "highest or most relevant qualification",
  "professionalSummary": "2–3 sentence professional summary written in third person",
  "sectorExperience": ["sector or industry 1", "sector or industry 2", "sector or industry 3"],
  "keyStrengths": [
    "strength 1 — specific skill or achievement from work history",
    "strength 2 — specific skill or achievement from work history",
    "strength 3 — specific skill or achievement from work history",
    "strength 4 — specific skill or achievement from work history",
    "strength 5 — specific skill or achievement from work history"
  ]
}

Rules:
- keyStrengths MUST contain exactly 5 non-empty strings drawn from the CV work history.
- sectorExperience should list 2–5 industries or sectors the candidate has worked in.
- professionalSummary should be written as a recruiter would describe the candidate.

Return ONLY the JSON object above. No other text.`;

  return callClaude(systemPrompt, userMessage, apiKey);
}

// ─── Main extraction orchestrator ────────────────────────────────────────────

async function extractWithTwoPass(cvText, notes, roleTitle, client, apiKey) {
  const hasNotes = notes && notes.trim().length > 10;

  // Run both passes in parallel for speed
  const [notesData, cvData] = await Promise.all([
    hasNotes
      ? extractFromNotes(notes, roleTitle, client, apiKey)
      : Promise.resolve({
          currentBase: "", currentBonus: "", currentPension: "",
          currentHealth: "", currentCar: "", currentLeave: "",
          currentOther: "", targetSalary: "", targetNotes: "",
          noticePeriod: "", interviewAvailability: "",
          motivationForMove: "",
          consultantNotes: [
            { headline: "Candidate overview", detail: "No interview notes provided — please add notes and re-extract." },
            { headline: "Current package", detail: "" },
            { headline: "Notice period", detail: "" },
            { headline: "Motivation", detail: "" },
            { headline: "Consideration", detail: "" },
          ],
        }),
    extractFromCV(cvText, roleTitle, client, apiKey),
  ]);

  // Merge: CV data provides profile fields; notes data provides compensation/interview fields
  return {
    // From CV
    name:               cvData.name               || "",
    headline:           cvData.headline           || "",
    location:           cvData.location           || "",
    euWorkRights:       cvData.euWorkRights        || "",
    education:          cvData.education          || "",
    professionalSummary: cvData.professionalSummary || "",
    sectorExperience:   Array.isArray(cvData.sectorExperience) ? cvData.sectorExperience : [],
    keyStrengths:       Array.isArray(cvData.keyStrengths) ? cvData.keyStrengths : [],

    // From notes
    currentBase:          notesData.currentBase          || "",
    currentBonus:         notesData.currentBonus         || "",
    currentPension:       notesData.currentPension       || "",
    currentHealth:        notesData.currentHealth        || "",
    currentCar:           notesData.currentCar           || "",
    currentLeave:         notesData.currentLeave         || "",
    currentOther:         notesData.currentOther         || "",
    targetSalary:         notesData.targetSalary         || "",
    targetNotes:          notesData.targetNotes          || "",
    noticePeriod:         notesData.noticePeriod         || "",
    interviewAvailability: notesData.interviewAvailability || "",
    motivationForMove:    notesData.motivationForMove    || "",
    consultantNotes:      Array.isArray(notesData.consultantNotes)
                            ? notesData.consultantNotes
                            : [],
  };
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

    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body || "", "utf8");

    const { fields, file } = parseMultipart(bodyBuffer, contentType);

    const notes      = fields.notes      || "";
    const roleTitle  = fields.roleTitle  || "";
    const client     = fields.client     || "";
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

    // Extract CV text
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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured on the server." }),
      };
    }

    // Two-pass extraction
    let candidateData;
    try {
      candidateData = await extractWithTwoPass(cvText, notes, roleTitle, client, apiKey);
    } catch (err) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: `Could not parse AI response: ${err.message}. Click Extract again — it usually succeeds on retry.`,
        }),
      };
    }

    const cvBase64 = file.buffer.toString("base64");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateData,
        cvBase64,
        cvMimeType:     file.mimetype,
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
