import { useState, useCallback } from "react";
import UploadStep from "./components/coversheet/UploadStep.jsx";
import ReviewStep from "./components/coversheet/ReviewStep.jsx";
import SuccessStep from "./components/coversheet/SuccessStep.jsx";
import { EMPTY_CANDIDATE } from "./types/coversheet.ts";

const today = new Date().toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" });

export default function App() {
  const [step, setStep] = useState(1); // 1=upload, 2=review, 3=success

  // Upload step state
  const [cvFile, setCvFile]       = useState(null);
  const [notes, setNotes]         = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [client, setClient]       = useState("");
  const [consultant, setConsultant] = useState("");
  const [date] = useState(today);

  // Review step state
  const [candidateData, setCandidateData] = useState(EMPTY_CANDIDATE);
  const [cvBase64, setCvBase64]           = useState("");
  const [cvMimeType, setCvMimeType]       = useState("");
  const [cvOriginalName, setCvOriginalName] = useState("");

  // Loading / error
  const [extracting, setExtracting]   = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [extractError, setExtractError] = useState("");
  const [generateError, setGenerateError] = useState("");

  // Success state
  const [filename, setFilename] = useState("");

  // ── Extract ──────────────────────────────────────────────────────────────
  const handleExtract = useCallback(async () => {
    if (!cvFile) {
      setExtractError("Please upload a CV before extracting.");
      return;
    }
    if (!roleTitle.trim()) {
      setExtractError("Please enter the Role Title.");
      return;
    }
    if (!client.trim()) {
      setExtractError("Please enter the Client / Company name.");
      return;
    }

    setExtractError("");
    setExtracting(true);

    try {
      const formData = new FormData();
      formData.append("cv", cvFile);
      formData.append("notes", notes);
      formData.append("roleTitle", roleTitle);
      formData.append("client", client);
      formData.append("consultant", consultant);

      const res = await fetch("/api/extract", { method: "POST", body: formData });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || `Server error ${res.status}`);
      }

      setCandidateData(json.candidateData);
      setCvBase64(json.cvBase64);
      setCvMimeType(json.cvMimeType);
      setCvOriginalName(json.cvOriginalName);
      setStep(2);
    } catch (err) {
      setExtractError(err.message || "Extraction failed. Please try again.");
    } finally {
      setExtracting(false);
    }
  }, [cvFile, notes, roleTitle, client, consultant]);

  // ── Generate PDF ─────────────────────────────────────────────────────────
  const handleDownload = useCallback(async (data) => {
    if (!data.name.trim()) {
      setGenerateError("Candidate name is required. Please fill in the Name field.");
      return;
    }

    setGenerateError("");
    setGenerating(true);

    try {
      const res = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateData: data,
          cvBase64,
          cvMimeType,
          roleTitle,
          client,
          consultant,
          date,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || `Server error ${res.status}`);
      }

      // Decode base64 PDF and trigger download
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob  = new Blob([bytes], { type: "application/pdf" });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement("a");
      a.href      = url;
      a.download  = json.filename;
      a.click();
      URL.revokeObjectURL(url);

      setFilename(json.filename);
      setStep(3);
    } catch (err) {
      setGenerateError(err.message || "PDF generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [cvBase64, cvMimeType, roleTitle, client, consultant, date]);

  // ── Reset ────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setCvFile(null);
    setNotes("");
    setRoleTitle("");
    setClient("");
    setConsultant("");
    setCandidateData(EMPTY_CANDIDATE);
    setCvBase64("");
    setCvMimeType("");
    setCvOriginalName("");
    setExtractError("");
    setGenerateError("");
    setFilename("");
    setStep(1);
  }, []);

  return (
    <>
      {/* ── App header ─────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header-logo">
          <div className="app-header-badge">NG</div>
          <div>
            <div className="app-header-name">Next Generation</div>
            <div className="app-header-sub">Recruitment</div>
          </div>
        </div>
        <span className="app-header-tag">Cover Sheet Generator &nbsp;·&nbsp; v3.0</span>
      </header>

      {/* ── Stepper ────────────────────────────────────────────────────── */}
      <nav className="stepper">
        <div className="step-item">
          <div className={`step-num ${step === 1 ? "active" : step > 1 ? "done" : ""}`}>
            {step > 1 ? "✓" : "1"}
          </div>
          <span className={`step-label ${step === 1 ? "active" : ""}`}>Prepare</span>
        </div>
        <div className="step-connector" />
        <div className="step-item">
          <div className={`step-num ${step === 2 ? "active" : step > 2 ? "done" : ""}`}>
            {step > 2 ? "✓" : "2"}
          </div>
          <span className={`step-label ${step === 2 ? "active" : ""}`}>Review &amp; Edit</span>
        </div>
        <div className="step-connector" />
        <div className="step-item">
          <div className={`step-num ${step === 3 ? "active" : ""}`}>3</div>
          <span className={`step-label ${step === 3 ? "active" : ""}`}>Done</span>
        </div>
      </nav>

      {/* ── Page content ───────────────────────────────────────────────── */}
      <main className="main-content">
        {step === 1 && (
          <UploadStep
            cvFile={cvFile}
            setCvFile={setCvFile}
            notes={notes}
            setNotes={setNotes}
            roleTitle={roleTitle}
            setRoleTitle={setRoleTitle}
            client={client}
            setClient={setClient}
            consultant={consultant}
            setConsultant={setConsultant}
            date={date}
            isExtracting={extracting}
            error={extractError}
            onExtract={handleExtract}
          />
        )}

        {step === 2 && (
          <ReviewStep
            candidateData={candidateData}
            setCandidateData={setCandidateData}
            roleTitle={roleTitle}
            client={client}
            consultant={consultant}
            date={date}
            cvMimeType={cvMimeType}
            cvOriginalName={cvOriginalName}
            isGenerating={generating}
            error={generateError}
            onDownload={handleDownload}
          />
        )}

        {step === 3 && (
          <SuccessStep
            candidateData={candidateData}
            roleTitle={roleTitle}
            client={client}
            consultant={consultant}
            date={date}
            filename={filename}
            onReset={handleReset}
          />
        )}
      </main>
    </>
  );
}
