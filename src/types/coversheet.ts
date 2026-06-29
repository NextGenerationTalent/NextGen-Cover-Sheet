export interface CandidateData {
  name: string;
  headline: string;
  location: string;
  euWorkRights: string;
  education: string;
  professionalSummary: string;
  sectorExperience: string[];
  keyStrengths: string[];
  currentBase: string;
  currentBonus: string;
  currentPension: string;
  currentHealth: string;
  currentCar: string;
  currentLeave: string;
  currentOther: string;
  targetSalary: string;
  targetNotes: string;
  noticePeriod: string;
  interviewAvailability: string;
  motivationForMove: string;
  consultantNotes: { headline: string; detail: string }[];
}

export const EMPTY_CANDIDATE: CandidateData = {
  name: "",
  headline: "",
  location: "",
  euWorkRights: "",
  education: "",
  professionalSummary: "",
  sectorExperience: [],
  keyStrengths: [],
  currentBase: "",
  currentBonus: "",
  currentPension: "",
  currentHealth: "",
  currentCar: "",
  currentLeave: "",
  currentOther: "",
  targetSalary: "",
  targetNotes: "",
  noticePeriod: "",
  interviewAvailability: "",
  motivationForMove: "",
  consultantNotes: [
    { headline: "", detail: "" },
    { headline: "", detail: "" },
    { headline: "", detail: "" },
    { headline: "", detail: "" },
    { headline: "", detail: "" },
  ],
};
