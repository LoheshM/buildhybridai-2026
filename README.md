# Tickmark

**Mark a class set of paper maths worksheets on your own laptop, without uploading a single photo.**

Tickmark is a web app for maths teachers.

1. **Read.** Gemini Nano reads each photo of a student's worksheet *inside Chrome on the teacher's laptop*.
2. **Mark.** Plain code marks every answer against the teacher's key and names the mistake (for example "added tops and bottoms").
3. **Check.** The teacher checks only the answers Tickmark flags.
4. **Plan.** To plan tomorrow's lesson, **only anonymous class totals** go to cloud Gemini. It writes a reteach mini-lesson and parent-note templates in English, Hindi or Tamil, and the laptop fills in each child's name.

> Class totals go up. Names stay here.

**Try it:** https://buildhybridai-lohe.web.app (free, no sign-in). Built for #BuildHybridAI 2026 on Firebase AI Logic hybrid inference.

## Why
- **Marking is hours of unpaid work.** Teachers spend a median 5 hours a week on grading and feedback (EdWeek Research Center, 2022).
- **Pupils' work is children's personal data.**
  - UK DfE guidance recommends that "personal data is not used in generative AI tools".
  - India's DPDP Act (s.9) requires verifiable parental consent to process a child's data.
  - US districts need vendor contracts before student data leaves.
  
  Every cloud AI grader we found uploads the photos. Tickmark is designed so it never does, so a teacher can use it without waiting for a procurement process.

## How the hybrid inference is used
Tickmark routes every AI call by **what data it carries**, not by how hard the task is.

| Data | Where it runs | Firebase AI Logic mode | Guard |
|---|---|---|---|
| Real student sheets (photos, names, answers) | This laptop only | `ONLY_ON_DEVICE` | Pre-call device gate, student lock, network guard; no cloud fallback, ever |
| Laptop without on-device AI | Nowhere: the teacher types answers into a grid | none | Marking runs in plain code |
| Built-in synthetic sample class | Laptop if Gemini Nano is ready, else a few live cloud reads, then recorded cloud readings | `PREFER_ON_DEVICE` | Image SHA-256 must match a sample sheet |
| Anonymous class totals | Cloud, falling back to Gemini Nano on 429, App Check failure or offline | `PREFER_IN_CLOUD` | Closed schema, small counts hidden, roster-name check, shown before sending |
| Parent-note personalisation | This laptop, plain code | none | Placeholder validation |

**Every answer shows where it ran:** "On this laptop · 7.3 s" or "Cloud AI", taken from the SDK's `inferenceSource`. The **Privacy & data** page lists the exact body of every request that left the browser.

**Why our own guards?**
- **The SDK falls back silently.** In `@firebase/ai` 3.1.0, a browser with no `LanguageModel` API sends even `ONLY_ON_DEVICE` requests to the cloud. Tickmark therefore checks `LanguageModel.availability()` itself before every student call, and wraps `fetch` to refuse any AI request made while a student sheet is being read.
- **The guard is checked.** It also refuses any image that isn't a known sample sheet, and any text containing a name from the class list.

**Model setup:**
- **Structured output:** one plain JSON Schema is used on both sides (`responseConstraint` on the device, `responseJsonSchema` in the cloud).
- **Image input:** inline JPEG.
- **Download:** `initializeDeviceModel()` runs on a click, with download progress shown.
- **Warm-up:** a call warms the model before the first sheet.
- **One queue:** all on-device calls go through a single queue, because parallel prompts abort each other.

## The model never decides a mark
Gemini Nano only *reads* the handwriting. Marking is exact fraction arithmetic in `src/marking/`, where 5/10 equals 1/2 but is flagged "not simplified".

**Naming the mistake:** ten detectors recompute common wrong methods (adding straight across, dividing without flipping, losing the whole number, …) and name the mistake when one matches.

**Flags the teacher checks:**
- crossed-out work;
- two answers;
- unparseable text;
- a likely lost mixed-number space ("11/2" against a key of "1 1/2");
- an unexplained wrong answer;
- a second on-device read that disagrees.

**One-tap fixes:** a flagged answer offers alternative readings to pick from, but a second opinion never changes a mark by itself.

**Checked practice sets:** the cloud's practice questions are re-checked by the same fraction engine, and any wrong AI answer is corrected and labelled.

## Measured (synthetic sample class, Chrome on a 16 GB laptop)
*Numbers are filled in from the final benchmark run; see `tools/bench.js`.*

| | Result |
|---|---|
| Exact reads on the device | {{DEVICE_EXACT}} |
| Misreads the teacher was **not** asked to check | {{UNFLAGGED}} |
| Time per sheet on the device, including the second read | {{SECS}} |
| Exact reads in the cloud (gemini-3.5-flash-lite, same sheets) | {{CLOUD_EXACT}} |

These sheets are generated: made-up students, handwriting from open-licence handwriting fonts, and planted mistakes (`tools/samples/`). Real children's handwriting will be harder; that's why the teacher checks the flags.

## Try it
1. Open https://buildhybridai-lohe.web.app in **Chrome 139+ on Windows, macOS or Linux** (desktop).
2. If the top bar says **Download on-device AI**, click it. Chrome downloads Gemini Nano once: a few GB, about 5 minutes. You can explore the sample meanwhile.
3. Click **Try the sample class**, then **Quick look: read 8** (or **Read all**).
4. Open **Check answers**. Use <kbd>J</kbd>/<kbd>K</kbd> to move, <kbd>Enter</kbd> when the reading is right, and <kbd>1</kbd>–<kbd>3</kbd> to pick a suggested reading.
5. Open **Results**, then **Plan tomorrow's lesson**. Review the "Before you send" table and send it.
6. Open **Privacy & data** to see every request that left the browser.

**No on-device AI on your laptop?**
- **Sample class:** the first 3 sheets are read live in the cloud (allowed only for made-up sheets); the rest use recorded cloud readings, labelled as such.
- **Real classes:** use the typed-answer grid.
- **Prompt API flag:** if `LanguageModel` is missing in Chrome, enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and restart Chrome.

## Run it locally
```bash
npm install
npm test            # unit tests (fraction engine, detectors, privacy layer)
npm run dev         # http://localhost:5173
```
**App Check in development:**
- Firebase App Check is enforced on Firebase AI Logic.
- For local development, create a debug token in the Firebase console (App Check → Apps → Manage debug tokens) and put it in `.env.development.local` as `VITE_APPCHECK_DEBUG_TOKEN=<token>`. That file is git-ignored and never included in a production build: `npm run build` fails if the token reaches `dist/`.

**Using your own Firebase project:** change `src/config.ts`. You need AI Logic with the Gemini Developer API, plus App Check with reCAPTCHA Enterprise.

## Firebase products
- **Firebase AI Logic** (hybrid inference, three modes).
- **App Check** (reCAPTCHA Enterprise, enforced, limited-use tokens).
- **Hosting** (CSP and security headers).
- **Remote Config**, for operator settings only:
  - the cloud model, from an allowlist;
  - the smallest group size shown (clamped to 3 or more);
  - live sample reads.
  
  Remote Config can tighten limits but never loosen privacy.

**Deliberately not used:** Firestore, Auth, Analytics and AI monitoring. Nothing about a student is stored server-side.

## Design boundaries
- **No cloud path for real student work, even with consent.** Free-tier Gemini Developer API terms allow human review of inputs, and cropping the name off a sheet doesn't anonymise handwriting.
- **No free text from the teacher in cloud requests.** The request is built from numbers and fixed words only.
- **No accounts or server storage.** Data lives in this browser's IndexedDB; Privacy & data has "Erase everything".
- **Fractions first.** Other numeric answers are marked by value, and word answers by exact match.
- **Desktop Chrome only for on-device reading.** Gemini Nano isn't available in mobile browsers.

## Licence and credits
- **Licence:** Apache-2.0 (see `LICENSE`). Third-party notices are in `THIRD_PARTY_NOTICES.md`.
- **AI tools:** built with Claude Code (Anthropic) as a coding assistant. The demo video narration uses an AI voice.
