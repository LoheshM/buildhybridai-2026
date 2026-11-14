# Tickmark

**Mark a class set of paper maths worksheets on your own laptop, without uploading a single photo.**

Tickmark is for maths teachers in grades 4–8 who mark paper worksheets. It starts with fractions, and with Indian CBSE and private schools, where paper is the norm and a teacher can mark 40 sheets a day.

1. **Read.** Gemini Nano reads each photo of a worksheet *inside Chrome on the teacher's laptop*.
2. **Mark.** Plain code marks every answer against the teacher's key and names the mistake, for example "added the tops and the bottoms".
3. **Check.** The teacher checks only what Tickmark flags.
4. **Plan.** To plan tomorrow's lesson, **only anonymous class totals** go to cloud Gemini. It writes a reteach mini-lesson and parent-note templates in English, Hindi or Tamil, and the laptop fills in each child's name.

> Class totals go up. Names stay here.

**Try it:** https://buildhybridai-lohe.web.app. It's free and needs no sign-in. Built for #BuildHybridAI 2026 on Firebase AI Logic hybrid inference.

## Why
- **Marking is hours of unpaid work.** Teachers spend a median 5 hours a week on grading and feedback (EdWeek Research Center, 2022).
- **Feedback that names the mistake is what helps,** and that's exactly what nobody has time to tally by hand.
- **The work being marked is children's personal data.**
  - UK DfE guidance recommends that "personal data is not used in generative AI tools".
  - India's DPDP Act (s.9) requires verifiable parental consent to process a child's data.
  - US districts need vendor contracts before student data leaves.
- **Every cloud AI grader we found uploads the photos.**

Tickmark is designed so a real class's photos, names and answers never leave the laptop. Nothing about a child is sent to, stored by or reviewed by an AI service.

## How the hybrid inference is used
Tickmark routes every AI call by **what data it carries**, not by how hard the task is.

| Data | Where it runs | Firebase AI Logic mode | Guard |
|---|---|---|---|
| Real student sheets (photos, names, answers) | This laptop only | `ONLY_ON_DEVICE` | Device gate, student lock and network guard; **no cloud fallback, ever** |
| Laptop without on-device AI | Nowhere: the teacher types answers into a grid | none | Marking still runs in plain code |
| Built-in synthetic sample class | Laptop when Gemini Nano is ready; otherwise up to 3 live cloud reads, then recorded cloud readings | `PREFER_ON_DEVICE` | Each image's SHA-256 must match a sample sheet |
| Anonymous class totals | Cloud, falling back to Gemini Nano on 429, App Check failure or network error; or kept on the laptop when the teacher asks | `PREFER_IN_CLOUD` / `ONLY_ON_DEVICE` | Closed schema, small groups hidden, roster-name check, shown before sending |
| Parent-note personalisation | This laptop, plain code | none | Placeholder validation |

**Every reading shows where it ran.** A step bar (Read sheets → Check flags → Results → Plan lesson) runs through every quiz. Labels such as "Laptop, 7.3 s" and "Cloud" come from the SDK's `inferenceSource`, and the **Privacy & data** page lists every request this browser sent to the AI service.

**Why Tickmark has its own guards:**
- In `@firebase/ai` 3.1.0, a browser with no `LanguageModel` API sends even `ONLY_ON_DEVICE` requests to the cloud.
- So Tickmark checks `LanguageModel.availability()` itself before every student call.
- It also wraps `fetch` so that any AI request while a student sheet is being read is refused. So is any image that isn't a sample sheet, and any text containing a name from the class list.
- Unit tests cover each guard.

**Model setup:**
- One plain JSON Schema is used on both sides: `responseConstraint` on the device, `responseJsonSchema` in the cloud.
- `initializeDeviceModel()` runs on a click and shows its progress.
- A warm-up call before the first sheet avoids the cold start (about 15 s).
- All on-device calls go through one queue, because parallel prompts abort each other. Hung calls time out and retry once.

## The model never decides a mark
- **Reading:** Gemini Nano only *reads* the handwriting.
- **Marking:** marking is exact fraction arithmetic (`src/marking/`). 5/10 equals 1/2, but is flagged "not simplified".
- **Naming the mistake:** ten detectors recompute common wrong methods (adding straight across, dividing without flipping, losing the whole number, …) and name the mistake when one matches.
- **Flags:** answers worth a look are flagged:
  - crossed-out work;
  - two answers;
  - an unreadable answer;
  - a likely lost mixed-number space, such as "11/2" against a key of "1 1/2";
  - an unexplained wrong answer;
  - a second on-device reading that disagrees.
- **Suggestions:** flagged answers offer the alternative reading as a one-tap fix. A second opinion never changes a mark by itself.
- **Names:** the name on each sheet is matched to the class list. Unsure matches are left for the teacher to confirm, never guessed.
- **Practice answers:** the cloud's practice answers are re-checked by the same fraction engine. A wrong AI answer is corrected and labelled.

## Measured (Chrome 157 on a 16 GB laptop, 15 Nov 2026)
| | Sample class (handwriting fonts) | Real handwritten digits (MNIST) |
|---|---|---|
| Answers read exactly by Gemini Nano on the laptop | 84–90% across runs (235 of 280 on the last run) | 78.6% (220 of 280) |
| **Misreads the teacher was not asked to check** | **0 of 280** | **0 of 280** |
| Answers flagged for the teacher (how many were real misreads) | 16.8% (45 of 47) | 24.3% (60 of 68) |
| Names matched to the class list (confident) | 28 of 28 (24) | 26 of 28 confident |
| Time per sheet on the laptop, including the second read | 11 s | 11 s |
| Same sheets read by cloud Gemini (`gemini-3.5-flash-lite`) | 279 of 280 | not sent: real-student path |
| Lesson plan | cloud 9–17 s; on the laptop 13 s | |

**What these numbers mean:**
- **Sample class:** generated sheets (`tools/samples/`): made-up students, handwriting rendered from open-licence fonts, and planted mistakes.
- **Real-handwriting set:** the same sheets with every answer rewritten in **real human handwritten digits** from the MNIST test set (`tools/samples/mnist.py`, CC BY-SA 3.0). They were uploaded as an ordinary class, so they went through the device-only student path.
- **The trade-off:** the cloud model reads better, but Tickmark gives that up for privacy and makes up for it with flags and the teacher's check. In both sets every misread was flagged.
- **Real children's handwriting** will vary more again. **Print blank quiz** gives you a sheet to try your own.

**Which laptops work:**
- **On-device reading** needs Gemini Nano in Chrome. That means Windows 10/11, macOS 13+ or Linux, with 16 GB of memory or a graphics card with more than 4 GB, plus 22 GB of free disk. We measured on a 16 GB laptop with a 4 GB RTX 3050 Ti.
- **Any other laptop or browser** still gets Tickmark's marking, mistake names and lesson planning through the typed-answer grid. Only photo reading needs Gemini Nano, and student photos are never sent anywhere instead.

## Try it
**You need** Chrome 139 or newer on a Windows, macOS or Linux laptop or desktop. On-device reading needs 16 GB of memory (or a graphics card with more than 4 GB) and 22 GB of free disk. Without these, the sample still works through the cloud path below.

1. Open https://buildhybridai-lohe.web.app.
2. Get Gemini Nano on the laptop:
   - **If the top bar shows a Download on-device AI button:** click it. Chrome downloads Gemini Nano once: a few GB, about 5 minutes.
   - **To try the app during the download:** open the sample class and click **Read now with recorded readings**. When the download finishes, a banner offers to **read the sheets again on this laptop**.
3. Click **Try the sample class**, then **Quick look: read 8**. To read all 28 (about 6 minutes), click **Read all**.
4. Open **Check answers**. Use <kbd>J</kbd>/<kbd>K</kbd> to move, <kbd>Enter</kbd> when the reading is right, and <kbd>1</kbd>–<kbd>3</kbd> to pick a suggested reading. Use **Name is right** to confirm a name.
5. Open **Results**, then **Plan tomorrow's lesson**. Read the "Before you send" table, then click **Send class totals and plan the lesson**. To keep everything on the laptop instead, tick **Keep this on the laptop**.
6. Open **Privacy & data** to see each request sent to the AI service. Under **Test the guard yourself**, click **Try to send them**: Tickmark refuses to send a non-sample photo and a sentence containing a class-list name, before either leaves the browser.

**No on-device AI on your laptop?** The top bar says "Sample: cloud mode".
- The sample class reads its first 3 sheets live with cloud Gemini (allowed only for made-up sheets) and uses cloud readings recorded on 15 Nov for the rest.
- Your own classes use the typed-answer grid.
- If Chrome says image reading is off, enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and restart Chrome.

## Run it locally
```bash
npm install
npm test            # unit tests: fraction engine, detectors, privacy layer, guards
npm run dev         # http://localhost:5173
```
**App Check debug token:** Firebase App Check is enforced on Firebase AI Logic. For local development:
1. Create a debug token in the Firebase console (App Check → Apps → Manage debug tokens).
2. Put it in `.env.development.local` as `VITE_APPCHECK_DEBUG_TOKEN=<token>`.

That file is git-ignored and never included in a production build: `npm run build` fails if the token reaches `dist/`.

**Your own Firebase project:** to use one, change `src/config.ts`. You need AI Logic with the Gemini Developer API, plus App Check with reCAPTCHA Enterprise.

**Tools:**
- `tools/samples/` regenerates the sample class.
- `tools/record-cloud.ts` records the cloud readings.
- `tools/bench.js` measures reading accuracy.
- `tools/deploy.mjs` builds, deploys and smoke-tests.

## Firebase products
- **Firebase AI Logic:** hybrid inference, three modes.
- **App Check:** reCAPTCHA Enterprise, enforced, with limited-use tokens. It loads only when a cloud request may follow, never on pages with student data.
- **Hosting:** strict Content Security Policy and security headers.
- **Remote Config:** operator settings only:
  - the cloud model (from an allowlist);
  - the smallest group shown (3 or more);
  - live sample reads;
  - a cloud kill switch.
  
  It can tighten limits but never loosen privacy.

**Deliberately not used:** Firestore, Auth, Analytics and AI monitoring. Nothing about a student is stored server-side.

## Design boundaries
- **No cloud path for real student work, even with consent.**
  - Free-tier Gemini Developer API inputs may be used by Google to improve its services.
  - Cropping the name off a sheet doesn't anonymise handwriting.
- **No free text from the teacher in cloud requests.** Requests are built from numbers and fixed words only.
- **No accounts or server storage.** Data lives in this browser's IndexedDB, and Privacy & data has **Erase everything**.
- **Fractions first.** Other numeric answers are marked by value, and word answers by exact match.
- **Desktop Chrome only for on-device reading.** Gemini Nano isn't available in mobile browsers.

## Operator notes
**Quota:** the free cloud quota (15 requests a minute, 500 a day) is shared by every visitor. To protect it, Tickmark has:
- a per-browser limiter;
- recorded readings for the sample;
- the Remote Config switches `sample_cloud_live_reads` (0–3) and `cloud_features_enabled`.

**Before a public deployment:**
- set a per-user quota on the AI Logic API;
- restrict the API key to the APIs it uses.

## Licence and credits
- **Licence:** Apache-2.0 (see `LICENSE`). Third-party notices are in `THIRD_PARTY_NOTICES.md`.
- **AI tools:** built with Claude Code (Anthropic) as a coding assistant. The demo video narration uses an AI voice.
