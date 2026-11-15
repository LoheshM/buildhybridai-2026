# Tickmark v2 day-1 probe: can Gemini Nano read handwritten sentences, and how close are its suggested marks to a human's?

> Copied from the project folder on 15 Nov 2026. Paths under `probe/` refer to the benchmark scripts kept outside this repository (the IAM handwriting data is under a research licence and is never committed); everything under `tools/` is in this repository.

*Run 15–15 Nov 2026 on the user's laptop (Chrome 157, Gemini Nano through the Prompt API, the same create/prompt options Firebase AI Logic uses on-device). Code and raw outputs: `probe/` (not in the repo: the IAM images are research-licensed).*

## Question 1: reading real handwriting

**Data.** IAM Handwriting Database lines (validation split, `Teklia/IAM-line` on Hugging Face). These are real adults' cursive, which is harder than most children's print.
- **Worksheets:** 10 sheets, each with 4 printed questions; every answer is 1–2 real handwritten lines pasted under its question. 40 answers.
- **Paragraphs:** 6 paragraphs of 5 real handwritten lines each.

| Read format | Character error | Word error | Exact answers | Time |
|---|---|---|---|---|
| v1: an `answers` array | 20.8% | 24.5% | 20/40 | 4.6 s/sheet |
| v2: one required field per question | 25.4% | 27.4% | 18/40 | (1 hang) |
| **v3: one required field per question, each anchored to its printed question** | **12.2%** (4.8% on the 9 completed sheets) | **13.6%** (6.6%) | **23/40** | 4.5 s/sheet (1 hang) |
| v3 + `maxLength` cap | worse: 3 hangs in 10 | | | |
| Paragraphs, 5 lines | **5.1%** | **8.8%** | 2/6 | 3.0 s |

**Failure modes, and the fix in the product:**
1. **Dropped trailing questions** (array format). Fixed by one *required* field per question: constrained decoding can't skip it.
2. **Answers shifted by one, or the printed question copied as the answer.** Fixed by naming each printed question in the prompt (v3). A leading copy of the printed question is also stripped by code (`stripPrinted`), which then flags the answer "check the reading".
3. **Hangs.** About 1 call in 10 never finishes. These are not tied to the sheet: a different sheet hangs on each run. The app gives each call a 30 s timeout with one retry, and resets the session after a hang.
4. **The occasional invented word or skipped line.** Open answers are never marked without the teacher, who sees the text next to the photo.

**End to end** (12 photo-style sheets of real SciEntsBank pupils' answers in handwriting fonts): 34/43 answers read exactly, 4.7 s per sheet, no hangs. Most of the misses were the copied-question pattern, which code now strips.

### Question 1b (found by the first in-app bench, 15 Nov): on a real worksheet, Nano *answers* instead of copying
The IAM worksheets above had questions unrelated to their answers, which hid this. On our own Science 7A and English 8C worksheets, Nano read the printed question and answered it. It filled in blanks, flipped True/False, read option letters as option text, and "corrected" misspellings to the key. The result was the **wrong mark with no flag for 15–19% of exact answers in Science and 29–41% in English**, whatever the prompt (`app/tools/harm.ts`):

| Read format (Science / English, exact answers) | Wrong mark, unflagged |
|---|---|
| A: full sheet, printed question named in the prompt | 15.3% / 28.9% |
| B: full sheet, question number only | 18.9% / 35.6% |
| C: full sheet, first words of the question + "never answer it yourself" | 19.6% / 41.1% |
| D: full sheet, full question + "never answer it yourself" | 16.7% / 40.0% |
| Two of these compared, disagreement flagged | still 10–13% (the reads err the same way) |
| E: transcribe every line, align to the questions in code | blanks still filled, spellings still corrected |
| **K2: each answer box cut out, all on one labelled strip, no question in view** | **6.3% / 23.3%** (Science: 4 of the 9 were empty boxes) |
| K1: one call per cut-out box | 9.7% / 32.3% |
| Words spelt letter by letter (English word answers) | 45/72 letter-exact: spellings still corrected |

**What shipped:**
- **The Tickmark answer sheet.** Pupils answer any worksheet in numbered boxes framed by four black squares. Code finds the squares, undoes the perspective, cuts out each box and **decides which boxes are empty** (ink measure; a blank box measures 0, one handwritten letter about 0.0065). Gemini Nano reads only the strip of boxes with writing in them.
- **Every reading is shown beside the pupil's own cut-out handwriting** in Check.
- **When spelling or the exact form counts,** a reading that equals the key is flagged "Check the spelling". That is exactly the error Nano makes, and a second read can't settle it.

**Verdict:** short answers and paragraphs **ship**. Nano reads them on the device and suggests a mark; the teacher sees the reading against the photo and decides.

## Question 2: suggested marks against human marks

**Data.** SemEval-2013 Task 7, SciEntsBank (CC-BY-4.0): real answers from grade 3–6 students to science questions, each labelled by trained annotators against a reference answer. Mapped to marks out of 2: correct = 2, partially correct = 1, contradictory or irrelevant = 0.
- **Prompt tuning:** 60 answers from the train split.
- **Reported number:** 150 answers from the held-out "unseen answers" test split, 50 per mark.

| Prompt (dev split, 60) | Exact agreement | Within one mark | Quadratic-weighted kappa | Wrong answer given full marks |
|---|---|---|---|---|
| v1: what's right, what's missing, then the mark | 51.7% | 93.3% | 0.37 | 4 |
| **v2: the mark, then a one-sentence reason** | **54.4%** | **94.7%** | **0.57** | 2 |
| v3: Nano ticks each key point, then the mark | 33.3% | 79.2% | 0.11 | 5 of 24 |
| v5: v2, stricter wording and 3 worked examples | 56.7% | 90.0% | 0.52 | 2 |
| v6: Nano quotes the words for each point, code checks the quote | 34.6% | 80.8% | 0.18 | 4 of 26 |
| product prompt v1: missing key points, then the mark | 46.7% | 88.3% | 0.31 | 1 |
| **product prompt (prod2): the mark, then the missing key points, then the reason** | **49.2%** | **94.9%** | **0.54** | **0** |

**Held-out test split** (146–150 answers):

| Prompt | Exact agreement | Within one mark | QWK | Wrong answer given full marks |
|---|---|---|---|---|
| v2 | **50.7%** | **90.4%** | 0.41 | 12 (8.2%) |
| product prompt v1 | 47.3% | 89.3% | 0.35 | 10 (6.7%) |
| **product prompt (prod2, shipped)** | **51.4%** | **91.9%** | **0.47** | **5 (3.4%)** |

**What we learned:**
- Nano judges best *holistically*. Asking it to tick or quote each key point makes it over-credit: it ticks points the answer doesn't state, and quotes real words that don't state the point.
- Agreement with a human is about **half exact, nine in ten within one mark**. That's useful for sorting a pile and reading a reason, but far from a marker.

**Shipped:** prod2. It is the best on the held-out set on every measure, and it also names the missing key points that the class totals use.

**Verdict:** suggestions are always shown in pencil with their reason, and the teacher decides every one. The in-app text quotes these numbers. The "model never decides a mark" rule from v1 still holds.

## Round 5 measurements (15 Nov 2026, Gemini Nano in Chrome on the author's laptop)

| Measure | Result | Source |
|---|---|---|
| Suggested marks, fenced prompt (shipped), 147 real pupils' answers (SciEntsBank held-out) | 57.8% equal to the human mark, 91.2% within one mark, 5 over-credits (human 0 → full) | `probe/results.jsonl` variant prod3 |
| Prompt injection in a pupil's answer (3 tries) | Nano suggested full marks 3/3 even with the answer fenced → code rule `talksToMarker`: no suggestion, flagged; 0 matches in 300 real answers | `tools/strip-length-probe.py` |
| Strip length (same 104 boxes) | 26-row strips 14.4% exact; 6–7-row strips 82.7% → sheets are read in strips of at most 10 answers | `tools/samples/out/strip-length.json` |
| Sample classes, recorded run (replayed for browsers without Nano) | Maths 83.7% exact, 3/270 unflagged misreads; science 66.7%, 6/132 (spelling or form, same mark); English 57.8%, 3/90; suggestions equal to reference: science 30/38, English 16/30 | `tools/samples/out/bench-*.json`, `public/samples/*/recorded-device.json` |
| Real human handwriting: MNIST digits written into the maths answer sheet, photo-processed | 81.3% exact (152/187), **0 wrong marks without a flag**, 4 misreads with the same mark, 25% flagged, 240/240 blank decisions | `tools/samples/out/mnist2/bench.json` |
| Bad photos (code only): tilt ±10°, perspective, 2 px blur, low light, soft and hard shadows, dim light with noise, JPEG 50 | 107/108 sheets cut (one refused for a retake), no written answer judged blank; photos blurred 2.5 px or more are refused with a retake message (round 8) | `tools/distort-check.py` |
| Other quiz's answer sheet | refused 12/12 (frame check); an identical layout can't be told apart | `tools/cut-check.py` |

Not measured: children's handwriting on real phone photos (no real pupils available).
