import { useState, useCallback } from "react";

function SectionCard({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card section-card">
      <button className="section-toggle" onClick={() => setOpen(!open)}>
        <span className="card-label">{title}</span>
        <span style={{ fontSize: 16, color: "var(--ng-grey-md)" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, className = "" }) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      <input
        className="field-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <textarea
        className="field-textarea"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export default function ReviewStep({
  candidateData, setCandidateData,
  roleTitle, client, consultant, date,
  cvMimeType, cvOriginalName,
  isGenerating, error,
  onDownload,
}) {
  const update = useCallback((patch) => {
    setCandidateData((prev) => ({ ...prev, ...patch }));
  }, [setCandidateData]);

  // Chips
  const [newChip, setNewChip] = useState("");
  const addChip = () => {
    const v = newChip.trim();
    if (v && !candidateData.sectorExperience.includes(v)) {
      update({ sectorExperience: [...candidateData.sectorExperience, v] });
    }
    setNewChip("");
  };

  // Strengths
  const updateStrength = (i, v) => {
    const arr = [...candidateData.keyStrengths];
    arr[i] = v;
    update({ keyStrengths: arr });
  };

  // Notes
  const updateNote = (i, field, v) => {
    const arr = candidateData.consultantNotes.map((n, idx) => idx === i ? { ...n, [field]: v } : n);
    update({ consultantNotes: arr });
  };

  const isPdf = cvMimeType === "application/pdf";

  return (
    <div>
      {/* ── Sticky banner ─────────────────────────────────────────────── */}
      <div className="sticky-banner">
        <div className="banner-fields">
          <div>
            <div className="banner-field-label">Client</div>
            <div className="banner-field-value">{client || "—"}</div>
          </div>
          <div className="banner-divider" />
          <div>
            <div className="banner-field-label">Role</div>
            <div className="banner-field-value">{roleTitle || "—"}</div>
          </div>
          <div className="banner-divider" />
          <div>
            <div className="banner-field-label">Consultant</div>
            <div className="banner-field-value" style={{ fontWeight: 500 }}>{consultant || "—"}</div>
          </div>
          <div className="banner-divider" />
          <div>
            <div className="banner-field-label">Date</div>
            <div className="banner-field-value" style={{ fontWeight: 500 }}>{date}</div>
          </div>
          <span className={`banner-badge ${isPdf ? "banner-badge-pdf" : "banner-badge-word"}`}>
            {isPdf ? "PDF — auto-merged" : "Word — text rendered"}
          </span>
        </div>
        <div className="banner-actions">
          <button
            className="banner-btn"
            onClick={() => onDownload(candidateData)}
            disabled={isGenerating}
          >
            {isGenerating
              ? <><div className="spinner spinner-dark" /> Generating…</>
              : <>↓ Download PDF</>}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 24 }} className="space-y-4">
        {error && (
          <div className="error-box">
            <span className="error-icon">⚠</span>
            <div>
              <div className="error-title">PDF generation failed</div>
              <div className="error-text">{error}</div>
            </div>
          </div>
        )}

        {/* ── Candidate Identity ──────────────────────────────────────── */}
        <SectionCard title="Candidate Identity">
          <div className="grid-2">
            <Field label="Full Name *" value={candidateData.name} onChange={(v) => update({ name: v })} placeholder="Candidate full name" />
            <Field label="Headline" value={candidateData.headline} onChange={(v) => update({ headline: v })} placeholder="Seniority | Years | Domain" />
            <Field label="Location" value={candidateData.location} onChange={(v) => update({ location: v })} placeholder="City, Country" />
            <Field label="EU Work Rights" value={candidateData.euWorkRights} onChange={(v) => update({ euWorkRights: v })} placeholder="EU Citizen / Stamp 4 / etc." />
            <Field label="Education" value={candidateData.education} onChange={(v) => update({ education: v })} placeholder="Highest qualification + institution" className="col-span-2" />
          </div>
        </SectionCard>

        {/* ── Professional Summary ────────────────────────────────────── */}
        <SectionCard title="Professional Summary">
          <TextArea
            value={candidateData.professionalSummary}
            onChange={(v) => update({ professionalSummary: v })}
            placeholder="2–3 sentences, third person, compelling overview of the candidate"
            rows={4}
          />
        </SectionCard>

        {/* ── Sector Experience ───────────────────────────────────────── */}
        <SectionCard title="Sector Experience">
          <div className="flex flex-wrap gap-2 mb-3">
            {candidateData.sectorExperience.map((chip, i) => (
              <span key={i} className="chip">
                {chip}
                <button
                  className="chip-remove"
                  onClick={() => update({ sectorExperience: candidateData.sectorExperience.filter((_, idx) => idx !== i) })}
                >×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="field-input"
              type="text"
              value={newChip}
              onChange={(e) => setNewChip(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addChip())}
              placeholder="Add sector (press Enter)"
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary" onClick={addChip} style={{ flexShrink: 0 }}>+ Add</button>
          </div>
        </SectionCard>

        {/* ── Key Strengths ───────────────────────────────────────────── */}
        <SectionCard title="Key Strengths">
          <div className="space-y-3">
            {candidateData.keyStrengths.map((s, i) => (
              <div key={i} className="strength-row">
                <span className="strength-bullet">▸</span>
                <input
                  className="field-input"
                  type="text"
                  value={s}
                  onChange={(e) => updateStrength(i, e.target.value)}
                  placeholder="Key strength (max 10 words)"
                  style={{ flex: 1 }}
                />
                <button
                  className="btn-ghost"
                  onClick={() => update({ keyStrengths: candidateData.keyStrengths.filter((_, idx) => idx !== i) })}
                  style={{ color: "var(--ng-grey-md)", fontSize: 18, padding: "4px 8px" }}
                >×</button>
              </div>
            ))}
          </div>
          <button
            className="btn btn-ghost mt-3"
            onClick={() => update({ keyStrengths: [...candidateData.keyStrengths, ""] })}
          >+ Add strength</button>
        </SectionCard>

        {/* ── Current Package ─────────────────────────────────────────── */}
        <SectionCard title="Current Package">
          <div className="grid-2">
            {[
              { label: "Base Salary", key: "currentBase", placeholder: "e.g. €92,000" },
              { label: "Bonus", key: "currentBonus", placeholder: "e.g. 12% (€11,040)" },
              { label: "Pension", key: "currentPension", placeholder: "e.g. 7% employer" },
              { label: "Health Insurance", key: "currentHealth", placeholder: "e.g. Yes – VHI family" },
              { label: "Car / Allowance", key: "currentCar", placeholder: "e.g. €8,000 car allowance" },
              { label: "Annual Leave", key: "currentLeave", placeholder: "e.g. 25 days" },
            ].map(({ label, key, placeholder }) => (
              <Field key={key} label={label} value={candidateData[key]} onChange={(v) => update({ [key]: v })} placeholder={placeholder} />
            ))}
            <Field label="Other Benefits" value={candidateData.currentOther} onChange={(v) => update({ currentOther: v })} placeholder="e.g. Share options, gym, remote working" className="col-span-2" />
          </div>
        </SectionCard>

        {/* ── Target Package ──────────────────────────────────────────── */}
        <SectionCard title="Target Package">
          <div className="grid-2">
            <Field label="Target Salary" value={candidateData.targetSalary} onChange={(v) => update({ targetSalary: v })} placeholder="e.g. €105,000–€120,000" />
            <Field label="Flexibility / Notes" value={candidateData.targetNotes} onChange={(v) => update({ targetNotes: v })} placeholder="e.g. Flexible depending on overall package" />
          </div>
        </SectionCard>

        {/* ── Availability ────────────────────────────────────────────── */}
        <SectionCard title="Availability">
          <div className="grid-2">
            <Field label="Notice Period" value={candidateData.noticePeriod} onChange={(v) => update({ noticePeriod: v })} placeholder="e.g. 1 month / Negotiable" />
            <Field label="Interview Availability" value={candidateData.interviewAvailability} onChange={(v) => update({ interviewAvailability: v })} placeholder="e.g. 48 hours notice required" />
          </div>
        </SectionCard>

        {/* ── Motivation ──────────────────────────────────────────────── */}
        <SectionCard title="Motivation for Move">
          <p style={{ fontSize: 12, color: "var(--ng-grey-md)", marginBottom: 10 }}>
            AI-generated — always review and personalise. Reference the client and role specifically.
          </p>
          <TextArea
            value={candidateData.motivationForMove}
            onChange={(v) => update({ motivationForMove: v })}
            placeholder="Third-person paragraph specific to this role and client…"
            rows={4}
          />
        </SectionCard>

        {/* ── Consultant Notes ─────────────────────────────────────────── */}
        <SectionCard title="Consultant Interview Notes">
          <p style={{ fontSize: 12, color: "var(--ng-grey-md)", marginBottom: 14 }}>
            5 bullets — bold headline + supporting detail. Lead with the strongest point.
          </p>
          <div className="space-y-4">
            {candidateData.consultantNotes.map((note, i) => (
              <div key={i} className="note-row">
                <div className="note-num">{i + 1}</div>
                <div style={{ flex: 1 }} className="space-y-3">
                  <input
                    className="field-input"
                    type="text"
                    value={note.headline}
                    onChange={(e) => updateNote(i, "headline", e.target.value)}
                    placeholder="Bold headline (max 8 words)"
                    style={{ fontWeight: 600 }}
                  />
                  <textarea
                    className="field-textarea"
                    rows={2}
                    value={note.detail}
                    onChange={(e) => updateNote(i, "detail", e.target.value)}
                    placeholder="Supporting detail — include numbers and specifics"
                  />
                </div>
                <button
                  className="btn-ghost"
                  onClick={() => update({ consultantNotes: candidateData.consultantNotes.filter((_, idx) => idx !== i) })}
                  style={{ fontSize: 18, padding: "4px 8px", alignSelf: "flex-start", marginTop: 8 }}
                >×</button>
              </div>
            ))}
          </div>
          <button
            className="btn btn-ghost mt-3"
            onClick={() => update({ consultantNotes: [...candidateData.consultantNotes, { headline: "", detail: "" }] })}
          >+ Add note</button>
        </SectionCard>

        {/* ── Salary warning ───────────────────────────────────────────── */}
        {!candidateData.currentBase && !candidateData.currentBonus && !candidateData.targetSalary && (
          <div className="warning-box">
            <span className="warning-icon">⚠</span>
            <div>
              <div className="warning-title">Package fields are blank</div>
              <div className="warning-text">
                Salary and package information was not found in the CV or notes. Add the figures to Current Package and Target Package above before downloading.
              </div>
            </div>
          </div>
        )}

        {/* ── Download CTA ─────────────────────────────────────────────── */}
        <div className="flex justify-end" style={{ paddingBottom: 40 }}>
          <button
            className="btn btn-primary"
            style={{ padding: "14px 32px", fontSize: 15 }}
            onClick={() => onDownload(candidateData)}
            disabled={isGenerating}
          >
            {isGenerating
              ? <><div className="spinner" /> Generating PDF…</>
              : <>↓ Download Combined PDF</>}
          </button>
        </div>
      </div>
    </div>
  );
}
