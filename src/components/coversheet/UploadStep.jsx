import { useRef, useState, useCallback } from "react";

const MAX_SIZE = 5.5 * 1024 * 1024;
const ALLOWED  = ["application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function UploadStep({
  cvFile, setCvFile,
  notes, setNotes,
  roleTitle, setRoleTitle,
  client, setClient,
  consultant, setConsultant,
  date,
  isExtracting, error,
  onExtract,
}) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState("");

  const handleFile = useCallback((file) => {
    setFileError("");
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      setFileError("Only PDF and Word (.doc, .docx) files are accepted.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setFileError(`File is ${formatBytes(file.size)} — maximum is 5.5 MB. Try compressing at ilovepdf.com.`);
      return;
    }
    setCvFile(file);
  }, [setCvFile]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInputChange = useCallback((e) => {
    handleFile(e.target.files?.[0]);
  }, [handleFile]);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>New Cover Sheet</h1>
        <p style={{ fontSize: 14, color: "var(--ng-grey-md)" }}>
          Upload the candidate CV and complete the details below, then click Extract.
        </p>
      </div>

      {error && (
        <div className="error-box" style={{ marginBottom: 20 }}>
          <span className="error-icon">⚠</span>
          <div>
            <div className="error-title">Could not extract</div>
            <div className="error-text">{error}</div>
          </div>
        </div>
      )}

      <div className="upload-layout">
        {/* ── Left column ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* CV upload */}
          <div className="card">
            <div className="card-header">
              <span className="card-label">Step 1 — Candidate CV</span>
            </div>
            <div className="card-body">
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                style={{ display: "none" }}
                onChange={onInputChange}
              />
              {!cvFile ? (
                <label
                  className={`upload-zone ${dragOver ? "drag-over" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => inputRef.current?.click()}
                  style={{ display: "block", cursor: "pointer" }}
                >
                  <div className="upload-zone-icon">📄</div>
                  <div className="upload-zone-title">Drop CV here or click to browse</div>
                  <div className="upload-zone-sub">PDF (recommended) or Word · Max 5.5 MB</div>
                </label>
              ) : (
                <div className="file-chip">
                  <span className="file-chip-icon">
                    {cvFile.type === "application/pdf" ? "📄" : "📝"}
                  </span>
                  <div>
                    <div className="file-chip-name">{cvFile.name}</div>
                    <div className="file-chip-size">{formatBytes(cvFile.size)}</div>
                  </div>
                  <button
                    className="file-chip-remove"
                    onClick={() => { setCvFile(null); setFileError(""); }}
                    title="Remove file"
                  >×</button>
                </div>
              )}
              {fileError && (
                <p style={{ fontSize: 12, color: "#e53e3e", marginTop: 8 }}>{fileError}</p>
              )}
            </div>
          </div>

          {/* Interview notes */}
          <div className="card">
            <div className="card-header">
              <span className="card-label">Step 2 — Interview Notes</span>
            </div>
            <div className="card-body">
              <p style={{ fontSize: 12, color: "var(--ng-grey-md)", marginBottom: 10 }}>
                Paste recruiter notes, Fireflies transcript, or structured bullets.{" "}
                <strong style={{ color: "var(--ng-black)" }}>Include all salary and package figures here</strong>
                {" "}— the AI uses notes as the primary source.
              </p>
              <textarea
                className="field-textarea"
                rows={8}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={`e.g. Base salary €92,000 with 12% bonus, €8,000 car allowance, private healthcare, 7% employer pension, 25 days leave. Targeting €105,000–€120,000.\n\nCandidate is motivated by the move to a more strategic role...`}
              />
            </div>
          </div>
        </div>

        {/* ── Right column ────────────────────────────────────────────── */}
        <div>
          <div className="card">
            <div className="card-header">
              <span className="card-label">Step 3 — Submission Details</span>
            </div>
            <div className="card-body space-y-3">
              <div>
                <label className="field-label">Role Title <span style={{ color: "#e53e3e" }}>*</span></label>
                <input
                  className="field-input"
                  type="text"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="e.g. Head of Finance"
                />
              </div>
              <div>
                <label className="field-label">Client / Company <span style={{ color: "#e53e3e" }}>*</span></label>
                <input
                  className="field-input"
                  type="text"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  placeholder="e.g. Acme Corporation"
                />
              </div>
              <div>
                <label className="field-label">Consultant</label>
                <input
                  className="field-input"
                  type="text"
                  value={consultant}
                  onChange={(e) => setConsultant(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="field-label">Date</label>
                <input
                  className="field-input"
                  type="text"
                  value={date}
                  readOnly
                  style={{ background: "#f4f4f5", color: "var(--ng-grey-md)", cursor: "default" }}
                />
              </div>
            </div>
          </div>

          <button
            className="btn btn-primary btn-full"
            style={{ marginTop: 16 }}
            onClick={onExtract}
            disabled={isExtracting}
          >
            {isExtracting ? (
              <><div className="spinner" /> Extracting… (10–20s)</>
            ) : (
              <>⚡ Extract Candidate Data</>
            )}
          </button>

          <div className="tips-box">
            <div className="tips-title">Tips for best results</div>
            <ul className="tips-list">
              <li>Include specific salary figures in notes, not just 'good package'</li>
              <li>State all components: base, bonus %, pension, car, health, leave</li>
              <li>PDF CVs preserve layout — recommended over Word</li>
              <li>All fields are editable before download</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
