import { useState, useCallback } from "react";

function buildTrackerNotes(data, roleTitle, client, date) {
  const lines = [
    `CANDIDATE SUBMISSION — ${date}`,
    `Role: ${roleTitle} | Client: ${client}`,
    "",
    `NAME: ${data.name}`,
    `HEADLINE: ${data.headline}`,
    `LOCATION: ${data.location}`,
    `EU WORK RIGHTS: ${data.euWorkRights}`,
    `EDUCATION: ${data.education}`,
    "",
    "PROFESSIONAL SUMMARY:",
    data.professionalSummary,
    "",
    "SECTOR EXPERIENCE:",
    data.sectorExperience.join(" | "),
    "",
    "KEY STRENGTHS:",
    ...data.keyStrengths.map((s) => `• ${s}`),
    "",
    "CURRENT PACKAGE:",
    data.currentBase   ? `Base: ${data.currentBase}`           : null,
    data.currentBonus  ? `Bonus: ${data.currentBonus}`         : null,
    data.currentPension? `Pension: ${data.currentPension}`     : null,
    data.currentHealth ? `Health: ${data.currentHealth}`       : null,
    data.currentCar    ? `Car/Allowance: ${data.currentCar}`   : null,
    data.currentLeave  ? `Annual Leave: ${data.currentLeave}`  : null,
    data.currentOther  ? `Other: ${data.currentOther}`         : null,
    "",
    "TARGET PACKAGE:",
    `Target Salary: ${data.targetSalary}`,
    data.targetNotes   ? `Notes: ${data.targetNotes}`          : null,
    "",
    "AVAILABILITY:",
    `Notice Period: ${data.noticePeriod}`,
    `Interview Availability: ${data.interviewAvailability}`,
    "",
    "MOTIVATION FOR MOVE:",
    data.motivationForMove,
    "",
    "CONSULTANT INTERVIEW NOTES:",
    ...data.consultantNotes.map((n, i) => `${i + 1}. ${n.headline}: ${n.detail}`),
  ];
  return lines.filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n");
}

function buildEmail(data, roleTitle, client, consultant) {
  const pkgParts = [
    data.currentBase  && `Base: ${data.currentBase}`,
    data.currentBonus && `Bonus: ${data.currentBonus}`,
    data.currentPension && `Pension: ${data.currentPension}`,
  ].filter(Boolean).join(" | ");

  const subject = `CV Submission — ${data.name} — ${roleTitle} — ${client}`;
  const body = `Dear [Client Contact First Name],

Please find attached the CV and cover sheet for ${data.name}, who I am delighted to put forward for the ${roleTitle} position at ${client}.

${data.professionalSummary}

${data.motivationForMove}

Current Package: ${pkgParts || "Please refer to cover sheet"}
Target Salary: ${data.targetSalary || "Please refer to cover sheet"}
Notice Period: ${data.noticePeriod || "Please refer to cover sheet"}

Key Highlights:
${data.keyStrengths.slice(0, 3).map((s) => `• ${s}`).join("\n")}

I would be delighted to discuss ${data.name}'s background in more detail. Please let me know your availability for a call or to arrange an interview.

Kind regards,
${consultant || "Your Name"}
Next Generation Recruitment`;

  return { subject, body: `SUBJECT: ${subject}\n\n${body}` };
}

function CopyBlock({ label, icon, content }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert("Could not copy — please select and copy manually.");
    }
  }, [content]);

  return (
    <div className="copy-block">
      <div className="copy-block-header">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span className="card-label">{label}</span>
        </div>
        <button className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={handleCopy}>
          {copied ? "✓ Copied!" : "Copy"}
        </button>
      </div>
      <pre className="copy-block-pre">{content}</pre>
    </div>
  );
}

export default function SuccessStep({ candidateData, roleTitle, client, consultant, date, filename, onReset }) {
  const trackerNotes = buildTrackerNotes(candidateData, roleTitle, client, date);
  const { body: emailFull } = buildEmail(candidateData, roleTitle, client, consultant);

  return (
    <div>
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="success-hero">
        <div className="success-icon">✓</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Cover Sheet Generated</h1>
        <p style={{ fontSize: 14, color: "var(--ng-grey-md)" }}>
          <strong style={{ color: "var(--ng-black)" }}>{filename}</strong> has been downloaded.
        </p>
        <p style={{ fontSize: 12, color: "var(--ng-grey-md)", marginTop: 4 }}>
          Upload this PDF to Tracker and attach to your submission email.
        </p>
      </div>

      {/* ── Summary ───────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-body">
          <div className="grid-3" style={{ textAlign: "center" }}>
            {[
              { label: "Candidate", value: candidateData.name },
              { label: "Role", value: roleTitle },
              { label: "Client", value: client },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="field-label" style={{ marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Copy outputs ──────────────────────────────────────────────── */}
      <div className="space-y-4" style={{ marginBottom: 24 }}>
        <div className="card-label" style={{ display: "block", marginBottom: 8 }}>Copy to Tracker &amp; Email</div>
        <CopyBlock label="Tracker Candidate Notes" icon="📋" content={trackerNotes} />
        <CopyBlock label="Submission Email" icon="✉" content={emailFull} />
      </div>

      {/* ── Workflow reminder ──────────────────────────────────────────── */}
      <div className="tips-box" style={{ marginBottom: 32 }}>
        <div className="tips-title">Tracker Workflow</div>
        <ol style={{ paddingLeft: 16, fontSize: 12, color: "var(--ng-grey-md)", lineHeight: 1.8 }}>
          <li>Upload <strong>{filename}</strong> to the candidate's documents in Tracker</li>
          <li>Paste Tracker Notes into the candidate's Internal Notes field</li>
          <li>Create a submission against the vacancy and attach the PDF</li>
          <li>Use the Submission Email as your covering message — adjust the client contact's first name</li>
        </ol>
      </div>

      {/* ── Reset ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "center", paddingBottom: 48 }}>
        <button className="btn btn-secondary" onClick={onReset} style={{ padding: "12px 28px" }}>
          ↺ New Cover Sheet
        </button>
      </div>
    </div>
  );
}
