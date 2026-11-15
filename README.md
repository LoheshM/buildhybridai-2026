# Tickmark

**Any worksheet. One Tickmark answer sheet. Marked on your own laptop, without uploading a single photo.**

Tickmark is for teachers who mark paper worksheets: maths, science, English, any subject with exact answers, sentences or paragraphs. Pupils answer on a printed **Tickmark answer sheet**; the teacher photographs the pile.

1. **Read.** Code finds the sheet's four corner squares, straightens the photo and cuts out each answer box. Gemini Nano reads the boxes *inside Chrome on the teacher's laptop*.
2. **Mark.** The answer key picks each question's type. Plain code marks every exact answer (numbers and units, fractions, algebra, multiple choice, words) and names the mistake.
3. **Decide.** For short answers and paragraphs, Gemini Nano only *suggests* a mark, in pencil. The teacher inks it. Anything doubtful is flagged, with the pupil's handwriting beside the reading.
4. **Plan.** To plan tomorrow's lesson, **only anonymous class totals** go to cloud Gemini. It writes a reteach lesson and parent-note templates in English, Hindi or Tamil, and the laptop fills in each child's name.

> Class totals go up. Names stay here.

**Try it:** https://buildhybridai-lohe.web.app. Free, no sign-in. Built for #BuildHybridAI 2026 on Firebase AI Logic hybrid inference.

## Why
- **Marking takes hours every week.** Teachers spend a median 5 hours a week on grading and feedback (EdWeek Research Center, 2022).
- **Feedback that names the mistake is what helps,** and nobody has time to tally it by hand.
- **The work being marked is children's personal data.** UK DfE guidance recommends that "personal data is not used in generative AI tools"; India's DPDP Act (s.9) requires verifiable parental consent to process a child's data; US districts need vendor contracts before student data leaves. The AI graders we looked at (Gradescope, Frizzle, Brisk, CoGrader, Redpen AI) all work from uploaded photos.

## How the hybrid inference is used
Tickmark routes every AI call by **what data it carries**, not by how hard the task is.

| Data | Where it runs | Firebase AI Logic mode | Guard |
|---|---|---|---|
| A real pupil's answer boxes, second reads and suggested marks | This laptop only | `ONLY_ON_DEVICE` | Device gate, pupil-sheet lock and network guard; **no cloud fallback, ever** |
| A laptop without on-device AI | Nowhere: the teacher types answers into a grid | none | Marking still runs in plain code |
| Made-up sample sheets | Laptop when Gemini Nano is ready; otherwise Nano's own readings recorded on 15 Nov are replayed, labelled "Gemini Nano · recorded" | `ONLY_ON_DEVICE` | Each photo's SHA-256 must match a sample sheet |
| Anonymous class totals | Cloud, with a compact on-device plan if the cloud fails and one retry on a second model if the free daily allowance runs out; or kept on the laptop when the teacher asks | `PREFER_IN_CLOUD`, `ONLY_IN_CLOUD`, `ONLY_ON_DEVICE` | Closed schema, small groups hidden, class-list name checks, shown before sending |
| Parent-note personalisation | This laptop, plain code | none | Placeholder validation |

Every reading shows where it ran ("On this laptop · 7.3 s", from the SDK's `inferenceSource`), and the **Privacy** page lists every request this browser sent.

**Why Tickmark has its own guards.** In `@firebase/ai` 3.1.0, a browser with no `LanguageModel` API sends even `ONLY_ON_DEVICE` requests to the cloud. Tickmark checks `LanguageModel.availability()` itself before every pupil call, and wraps `fetch` so that any AI request is refused while a pupil's sheet is being read, as is any image that isn't a fingerprinted sample sheet, any file reference, and any class-list name anywhere in the request (Indian-script names with case endings included). Unit tests cover each guard, and **Privacy → Test the guard yourself** shows the refusals.

## Why an answer sheet
On 15 Nov we measured Gemini Nano reading whole worksheets. It **answered the printed questions instead of copying the pupil**: it filled in blanks, flipped True/False and corrected misspellings, and 15–40% of exact answers got the wrong mark with no flag, whatever the prompt said (`docs/benchmarks.md`). So pupils write on a Tickmark answer sheet, printed from the key, and code cuts out each box. Nano reads boxes that carry no question to answer.

The cutting is plain TypeScript (`src/img/`): corner squares, a four-point homography, an upside-down check, a printed-frame check that refuses another quiz's sheet, and per-box ink measures relative to each box's own paper. Code, not the model, decides which boxes are empty: asked about an empty box, Nano invents an answer.

## The model never decides a mark
- **Exact answers** are marked by code (`src/marking/`): units convert (35 mm = 3.5 cm), 2/4 equals 1/2 but is flagged "not simplified", algebra is compared by value, multiple choice and words are normalised. Named mistakes include "Wrong unit", "Added (or subtracted) tops and bottoms", "Sign error" and "Did not simplify". When code is unsure (a right value in another form, an answer the same as the question, working beside the answer) it flags the answer for the teacher instead of guessing.
- **Open answers** (short answers with key points, paragraphs with a rubric) get Gemini Nano's suggestion, in pencil. The teacher inks it, adjusts the key points, or overrides. A pupil's answer is fenced as data in the prompt, and answers that talk to the marker get no suggestion at all.
- **Flags** route anything doubtful to the teacher: two answers, crossed-out work, an unread box with ink in it, a reading that disagreed on a second look, a spelling Nano may have corrected, working written beside the answer, and more.

## Measured (Gemini Nano in Chrome 157 on a 16 GB laptop, 15 Nov 2026)

| Measure | Result |
|---|---|
| Real human handwriting: MNIST digits written into 24 maths answer sheets, photo-processed | 81.3% read exactly (152/187); **no wrong mark without a flag**; 25% of answers flagged; 240/240 blank decisions |
| Suggested marks on 147 real pupils' short answers marked by people (SciEntsBank) | 58% equal to the human mark, 91% within one mark |
| Sample classes, recorded run | Maths 83.7% of exact answers read exactly, science 66.7%, English 57.8%; after today's rules, 0 unflagged wrong marks in all three |
| Bad photos (code only): tilt, perspective, 2 px blur, dim light with noise, soft and hard shadows, heavy JPEG | 107/108 cut (one refused for a retake), no written answer judged blank; photos blurred by 2.5 px or more are refused with a retake message |
| Long strips | 26 answer rows: 14% exact; 6–7 rows: 83%. Sheets are read in strips of at most 10 answers. |
| Prompt injection in a pupil's answer | Nano gave full marks 3/3 even fenced, so a code rule withholds the suggestion |

Not yet measured: children's handwriting in real phone photos.

## Run it locally
```bash
npm install
npm test            # unit tests: marking engine, privacy payload, guards, answer sheet
npm run dev         # http://localhost:5173
```
**App Check debug token:** App Check is enforced on Firebase AI Logic. For local development, create a debug token in the Firebase console (App Check → Apps → Manage debug tokens) and put it in `.env.development.local` as `VITE_APPCHECK_DEBUG_TOKEN=<token>`. That file is git-ignored; `npm run build` fails if the token, analytics or the dev-only Nano recorder reach `dist/`.

**Your own Firebase project:** change `src/config.ts`. You need AI Logic with the Gemini Developer API, plus App Check with reCAPTCHA Enterprise.

**Tools:**
- `tools/samples/` generates and renders the three made-up classes (`classes.py`, `render3.py`) and the MNIST benchmark (`mnist2.py`).
- `tools/bench2.py <url> [--record]` reads the sample classes with Gemini Nano through the real app; `--record` (dev server only) writes the replay files.
- `tools/cut-check.py`, `tools/distort-check.py` check the answer-sheet cutting; `tools/mnist-bench.py`, `tools/strip-length-probe.py` measure Nano.
- `tools/live-regression.mjs` runs the judge path in a fresh browser with no on-device AI; `tools/deploy.mjs` builds, deploys and smoke-tests.

## Firebase products
- **Firebase AI Logic:** hybrid inference, routed by data class.
- **App Check:** reCAPTCHA Enterprise, enforced, with limited-use tokens. It loads only when a cloud request may follow.
- **Hosting:** strict Content Security Policy and security headers.
- **Remote Config:** the cloud model (from an allowlist), the smallest group shown (3 or more), live sample reads (0 by default) and a cloud kill switch. It can't send pupils' data or lower the group size below 3.

**Deliberately not used:** Firestore, Auth, Analytics and AI monitoring. Nothing about a pupil is stored server-side.

## Design boundaries
- **Pupils answer on a Tickmark answer sheet.** Reading whole worksheets made Nano answer the questions. A sheet from another quiz with an identical layout can't be told apart; any other layout is refused.
- **Open answers are suggestions.** The teacher inks every one.
- **No cloud path for real pupils' work, even with consent.** Free-tier Gemini Developer API inputs may be used by Google to improve its services, and handwriting isn't anonymous.
- **No accounts or server storage.** Data lives in this browser's IndexedDB; Privacy has **Erase everything**.
- **On-device reading needs desktop Chrome with Gemini Nano** (16 GB of memory or a GPU with more than 4 GB). Other laptops use the typed-answer grid.

## Operator notes
**Quota:** the free cloud quota (15 requests a minute and 500 a day per model) is shared by every visitor. Tickmark protects it with a per-browser limiter, recorded Nano readings for the samples, the Remote Config switches `sample_cloud_live_reads` and `cloud_features_enabled`, and one retry on the second allowlisted model. Before a wider deployment, set a per-user quota on the AI Logic API and restrict the API key.

## Licence and credits
- **Licence:** Apache-2.0 (see `LICENSE`). Third-party notices are in `THIRD_PARTY_NOTICES.md`.
- **AI tools:** built with Claude Code (Anthropic) as a coding assistant. The demo video narration uses an AI voice.
