
## Bug Fixes (Round 1)
- [x] Fix Key Strengths not rendering in PDF (empty column)
- [x] Add spacing gap between Sector Experience chips and Key Strengths/Package block
- [x] Fix Consultant Notes: prioritise interview notes field over CV text in LLM prompt
- [x] Fix Target Notes text running off the page (overflow/clipping in PDF)
- [x] Redact candidate personal details (phone, email, address) from appended CV pages — Option B: re-render as clean text for both PDF and Word

## Bug Fixes (Round 2)
- [x] Fix cover sheet overlap: "Interview Availability" text colliding with Availability section
- [x] Replace destructive CV re-render with selective redaction: preserve original PDF, draw white rectangles only over phone/email text positions
- [x] Word CVs: strip phone/email inline from extracted text before re-rendering (keep structure)
