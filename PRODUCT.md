# Product

<!-- impeccable:product-schema 1 -->

*Written 15 Nov 2026 from the project's own plan and research (PLAN.md, docs/WIDENING_PLAN.md, docs/research). The owner asked not to be interviewed; facts marked (inferred) come from those documents, not from a confirmation round.*

## Platform

web

## Users
School teachers who set short paper worksheets and mark them by hand: maths, science and English, roughly ages 9 to 15 (grades 4 to 9). They mark after school or in the evening at a laptop, from a pile of 20 to 40 sheets, often photographed on a phone. Many work in India and the UK, with parents who read Hindi or Tamil (inferred from the research and the parent-note languages). Secondary audience: hackathon judges trying the made-up sample classes with or without on-device AI.

## Product Purpose
Tickmark marks a class set of paper worksheets on the teacher's own laptop. The answer key picks each question's type. Code marks what it can check exactly (fractions, numbers and units, algebra, multiple choice, one-word answers) and names the mistake. Gemini Nano, in Chrome on the laptop, reads the handwriting and suggests marks for short answers and paragraphs; the teacher decides those. Then it shows what the class got wrong and plans a reteach lesson from anonymous class totals. Success: the pile is marked in a fraction of the time, every mark is one the teacher would stand behind, and no pupil's photo, name or words left the laptop.

## Positioning
Hybrid by data class: pupils' work is only ever read on the device, and only anonymous class totals (counts and fixed mistake names) reach the cloud. Code decides exact marks, the model only suggests, and the teacher decides. This is the trust rule, and the network guard, the Outbox and a published exact-attacker privacy test make it checkable.

## Operating Context
- Chrome desktop with Gemini Nano (on-device), or any browser without it (typed answers for real classes; recorded readings for the sample).
- The marking ritual: answer key first, then the pile, marking by question or by sheet, a red pen, ticks and crosses in the margin, a score ringed at the top.
- Photos come from a phone, moved to the laptop without a cloud album.
- Firebase AI Logic (hybrid inference), App Check, Remote Config and Hosting.

## Capabilities and Constraints
- Question types: fraction, number or measurement, algebra, multiple choice or true/false, one word, short answer (key points), paragraph (rubric). The teacher can override the detected type.
- Exact types are marked by code; open types are suggested by Gemini Nano and decided by the teacher.
- No accounts and no server storage: everything lives in the browser's IndexedDB.
- Three made-up sample classes (Maths 6B, Science 7A, English 8C), with SHA-256-pinned photos.
- Measured, not claimed: reading and suggestion agreement numbers come from dated benches (docs/research/06).

## Brand Commitments
- Name: Tickmark. Tagline: "Class totals go up. Names stay here."
- Voice: plain, teacher-to-teacher, no hype; never "auto-grades".
- Kalam is used for handwriting marks (it covers Devanagari, which the Hindi notes need).

## Evidence on Hand
- Day-1 probe (15 Nov 2026): real IAM handwriting read at 4.8% character error on completed reads, and SciEntsBank agreement with human markers.
- v1 bench: 28 sheets, 89.3% exact, 0 of 280 unflagged misreads.
- No teacher testimonials or school customers exist; none may be invented.

## Product Principles
1. Code proves, the model suggests, the teacher decides, and the screen shows which is which.
2. Pupils' work never leaves the laptop, and the product proves it rather than promising it.
3. Every number on screen was measured, and it carries its date.
4. Honest about limits: a design boundary has a reason, not a roadmap.

## Accessibility & Inclusion
WCAG 2.2 AA. Keyboard-first checking (one key per decision). Readable at night on laptop screens. Names and notes in Indian scripts (Devanagari, Tamil).
