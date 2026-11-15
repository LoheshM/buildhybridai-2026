---
name: Tickmark
description: The teacher's mark register. Red ink for marks code or the teacher made, graphite pencil for marks Gemini Nano only suggested.
colors:
  cover: "#1d2b55"
  cover-2: "#2a3b6d"
  cover-3: "#3a4c82"
  cover-ink: "#f3f5fb"
  cover-ink-2: "#c3cbe2"
  red: "#c4122f"
  red-soft: "#fbe9ec"
  hl: "#ffdf3d"
  hl-soft: "#fff4b8"
  hl-ink: "#4a3d00"
  device: "#0a7563"
  device-soft: "#dcf1ec"
  ok: "#1f6f3a"
  paper: "#f5f7fb"
  sheet: "#ffffff"
  sheet-2: "#eef2f8"
  rule: "#dfe5ef"
  rule-2: "#c5cfe0"
  ink: "#17203a"
  ink-2: "#434c66"
  ink-3: "#5f6884"
  pencil: "#5d6271"
  pencil-soft: "#eceef3"
  cloud: "#4f5974"
  cloud-soft: "#e6e9f1"
  focus: "#2a5bd7"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, Segoe UI, Nirmala UI, Noto Sans Devanagari, Noto Sans Tamil, sans-serif"
    fontSize: "clamp(2rem, 1.2rem + 2.4vw, 3.1rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, Segoe UI, Nirmala UI, Noto Sans Devanagari, Noto Sans Tamil, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.012em"
  title:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, Segoe UI, Nirmala UI, Noto Sans Devanagari, Noto Sans Tamil, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.012em"
  title-sm:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, Segoe UI, Nirmala UI, Noto Sans Devanagari, Noto Sans Tamil, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.012em"
  body-lg:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, Segoe UI, Nirmala UI, Noto Sans Devanagari, Noto Sans Tamil, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, Segoe UI, Nirmala UI, Noto Sans Devanagari, Noto Sans Tamil, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"tnum\" 1"
  body-sm:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, Segoe UI, Nirmala UI, Noto Sans Devanagari, Noto Sans Tamil, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible, system-ui, Segoe UI, Nirmala UI, Noto Sans Devanagari, Noto Sans Tamil, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.5
  mark:
    fontFamily: "Kalam, Segoe Print, cursive"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1
  score:
    fontFamily: "Kalam, Segoe Print, cursive"
    fontSize: "1.3rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "\"tnum\" 1"
rounded:
  xs: "3px"
  sm: "4px"
  md: "6px"
  lg: "10px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  gutter: "24px"
  section: "36px"
  register-row: "38px"
components:
  button-default:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-default-hover:
    backgroundColor: "{colors.sheet-2}"
  button-primary:
    backgroundColor: "{colors.cover}"
    textColor: "{colors.cover-ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.cover-2}"
  button-ink:
    backgroundColor: "{colors.red}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-small:
    typography: "{typography.body-sm}"
    padding: "4px 10px"
    height: "32px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    size: "36px"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
    height: "40px"
  chip-ink:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  chip-pencil:
    backgroundColor: "{colors.pencil-soft}"
    textColor: "{colors.pencil}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  pill-device:
    backgroundColor: "{colors.device-soft}"
    textColor: "{colors.device}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  pill-cloud:
    backgroundColor: "{colors.cloud-soft}"
    textColor: "{colors.cloud}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  flag:
    backgroundColor: "{colors.hl}"
    textColor: "#1b1600"
    rounded: "{rounded.xs}"
    padding: "1px 8px"
  flag-soft:
    backgroundColor: "{colors.hl-soft}"
    textColor: "{colors.hl-ink}"
    rounded: "{rounded.xs}"
    padding: "1px 8px"
  panel:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  callout:
    backgroundColor: "{colors.sheet-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  callout-device:
    backgroundColor: "{colors.device-soft}"
  callout-warn:
    backgroundColor: "{colors.hl-soft}"
    textColor: "{colors.hl-ink}"
  callout-bad:
    backgroundColor: "{colors.red-soft}"
  topbar:
    backgroundColor: "{colors.cover}"
    textColor: "{colors.cover-ink}"
    padding: "0 24px"
    height: "56px"
  status-light:
    backgroundColor: "{colors.cover-2}"
    textColor: "{colors.cover-ink}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  tab:
    textColor: "{colors.ink-2}"
    padding: "10px 14px"
  tab-active:
    textColor: "{colors.ink}"
  class-cover:
    backgroundColor: "{colors.cover}"
    textColor: "#ffffff"
    padding: "22px 22px 22px 26px"
  register-row:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    height: "{spacing.register-row}"
  register-cell-wrong:
    backgroundColor: "{colors.red-soft}"
  mark:
    textColor: "{colors.red}"
    typography: "{typography.mark}"
    size: "28px"
  mark-pencil:
    textColor: "{colors.pencil}"
    size: "28px"
  score-ring:
    textColor: "{colors.red}"
    typography: "{typography.score}"
    height: "46px"
---

# Design System: Tickmark

## Overview

**Creative North Star: "The Mark Register"**

Tickmark looks like the book a teacher keeps for a class: the class list down the left, the questions across, and a mark in every cell. A navy register cover (the top bar, primary buttons, the class covers on the welcome page) frames cool white paper. Everything on the paper is a working surface, not a dashboard: the register grid, panels ruled with hairlines, and one dominant work region per screen. The system turns down the SaaS dashboard of cards and KPI tiles. Results opens with one summary sentence and then the register itself.

The whole visual language exists to show **who made each mark**. Code and the teacher write in red ink, drawn as solid SVG strokes. Gemini Nano only suggests, so its marks are dashed graphite pencil. Highlighter yellow means "this needs you". Teal means "on this laptop" and slate means "in the cloud". Each of these colours carries one meaning and is not reused for decoration, so a teacher can read the state of a whole class at a glance. The tick, cross, half-tick, dash and question shapes, and hatching for "waiting", carry the same meaning without colour.

Density matches a real register: 38 px rows, tabular figures, sticky names and headings, and keyboard-first checking with one key per decision. The type is Atkinson Hyperlegible, chosen for legibility at night and for Indian-script fallbacks. The one hand-drawn voice is Kalam, and it is used only for the marks themselves. There is one authored motion: a pencil suggestion redrawn as a red-ink stroke when the teacher confirms it.

**Key Characteristics:**
- Navy register cover over cool white paper; light ("Paper") and dark ("Chalkboard") themes from the same token names.
- Every colour has a single meaning: red ink = decided mark, graphite = suggestion, yellow = needs you, teal = laptop, slate = cloud.
- Status reads in greyscale: distinct mark shapes, solid vs dashed strokes, hatched cells for waiting.
- Dense, ruled, flat surfaces; one shadow token for things that float.
- Atkinson Hyperlegible for every label and number (tabular); Kalam only for marks and scores.
- One signature motion: pencil to pen in 250 ms, skipped under reduced motion.

## Colors

A restrained navy-and-paper ground where each saturated colour is a signal with one meaning.

### Primary
- **Register-Cover Navy** (cover): the top bar, primary buttons, the selected segment, checkbox accent, active tab underline, the class covers on the welcome page and the toast. It is the frame and the "go" action, never a mark. Two lifts, **Cover Lift** (cover-2) and **Cover Bright** (cover-3), give hover states on navy and the "right" segment of the question bar. **Cover Ink** (cover-ink) and **Cover Ink Muted** (cover-ink-2) are text on navy.

### Secondary
- **Red Ink** (red): every mark code or the teacher made (tick, cross and half-tick strokes), the ringed score, the point totals in the answer margin, the ruled margin beside each answer, the "Ink" chip for types code marks, and the "Ink n/m" button, because pressing it makes a red mark. It is also the validation border on a bad field.
- **Red Wash** (red-soft): a wrong cell in the register (half-strength for a partly right cell), the "Ink" chip ground, the mistake tags on Results and the error callout.

### Tertiary
- **Highlighter** (hl): only "this needs you". Flags ("Check the spelling"), the waiting count on the Check tab, the tint under a mark to be checked, the underline on a register cell to look at, and text selection. **Highlighter Wash** (hl-soft) with **Highlighter Ink** (hl-ink) is the soft flag ("3 waiting for you"), the warning callout and the in-place tint on a freshly changed row or tile.
- **Laptop Teal** (device), with **Laptop Wash** (device-soft): only "this happened on this laptop". The on-device pill, the device callout, the reading progress bar, the drop zone when a file is over it, and a tile while it is being read. The top-bar status dot uses a brighter teal on navy.
- **Settled Green** (ok): rare. The "all decided" check in the question list and the "verified" word on the lesson plan.

### Neutral
- **Cool Paper** (paper): the page ground.
- **Sheet White** (sheet) and **Sheet Tint** (sheet-2): panel and table surfaces; the tint is hover, focused answer row, callout and sticky foot row.
- **Hairline** (rule) and **Hairline Strong** (rule-2): row rules, panel borders, control borders, the name-column and total-column rules.
- **Register Ink** (ink), **Ink Muted** (ink-2), **Ink Quiet** (ink-3): text in three steps. Muted is secondary text and quiet buttons; quiet is placeholders, footers and question-type captions.
- **Graphite Pencil** (pencil) with **Pencil Wash** (pencil-soft): only a suggestion Gemini Nano made. Dashed pencil marks, the pencil chip, Nano's one-line reason, the "so far" score, and the hatch on cells waiting for the teacher.
- **Cloud Slate** (cloud) with **Cloud Wash** (cloud-soft): only "this went to or came from the cloud". The cloud and recorded-reading pills.
- **Focus Blue** (focus): the 3 px keyboard focus ring and the focused field border; nothing else.

The dark theme ("Chalkboard") redefines the same tokens: paper `#0f1528`, sheet `#161e36`, ink `#e9edf7`, cover `#0a0f20`, red `#ff7085`, pencil `#a7adbd`, highlighter `#e8c63a`, teal `#4cd2ba`, focus `#8eb0ff`. On the dark theme, primary buttons and the active tab underline flip to a pale navy (`#c9d4f5`) with near-black text.

### Named Rules
**The Red Ink Rule.** Red is a mark someone stands behind: a stroke, a ringed score, a point total, the margin rule, the "Ink" chip, or the button that inks a mark. It is never interface chrome. Tabs, the current question, delete buttons and confirmations are navy or grey.

**The Highlighter Means You Rule.** Yellow appears only where the teacher has to act. If nothing is waiting, there is no yellow on the screen.

**The Laptop-or-Cloud Rule.** Teal is on this laptop, slate is the cloud, and the two are never swapped or used decoratively. Where data went is the product's claim, so its colour must stay honest.

## Typography

**Display Font:** Atkinson Hyperlegible Next Variable (with Atkinson Hyperlegible, system-ui, Segoe UI, Nirmala UI, Noto Sans Devanagari, Noto Sans Tamil)
**Body Font:** the same Atkinson Hyperlegible stack
**Mark Font:** Kalam 400 / 700 (with Segoe Print, cursive)

**Character:** one highly legible humanist sans for every label, sentence and number, with tabular figures and a slashed zero, so columns of scores line up. Kalam is the teacher's hand and appears only where a mark is written.

### Hierarchy
- **Display** (700, clamp 2rem to 3.1rem, 1.08, -0.025em, max 18ch): the welcome headline only.
- **Headline** (700, 1.875rem, 1.2; 1.5rem at 640 px and below): page headings.
- **Title** (700, 1.375rem, 1.2): section headings and the quiz title in the context bar. **Title small** (700, 1.125rem) is panel headings and the question prompt on Check.
- **Body large** (400, 1.125rem, 1.5, max 62ch): the lede under a page heading.
- **Body** (400, 1rem / 16px, 1.5, tabular figures, paragraphs max 70ch with pretty wrapping): everything else. Answer readings are 1.0625rem; one-word answers 1.25rem. Fields are always 16px so phones do not zoom.
- **Body small** (0.875rem) and **Label** (600, 0.8125rem): chips, pills, flags, register headings, hints, legends and footer.
- **Mark** (Kalam 700, 1rem, line height 1): figures inside marks, point totals in the margin (1.05rem). Pencil marks use Kalam 400 in graphite.
- **Score** (Kalam 700, 1.3rem; 1.85rem for the large ring): the ringed total.

Headings are 700 with -0.012em tracking and balanced wrapping. There are no uppercase labels and no tracked-out small caps.

### Named Rules
**The Hand Is For Marks Rule.** Kalam sets marks, scores and point totals only. Nano's reasons, question numbers, headings and labels stay in Atkinson; Nano's reason is Atkinson italic in graphite.

**The Tabular Rule.** Every figure on screen is tabular, so register columns, totals and counts align without extra work.

## Layout

The page is a single column capped at 1320 px, padded 28 px top, 24 px sides and 64 px bottom (18 / 16 / 48 px at 640 px and below, respecting safe-area insets). A sticky 56 px navy top bar is followed, inside a quiz, by a white context bar with the quiz title, class name and the four step tabs (Sheets, Check, Results, Plan the lesson). Scroll padding of 76 px keeps focused rows clear of the sticky bars.

Each screen gives one work region most of the width:
- **Check:** a 220 px question list beside the answer panel (gap 20 px). By sheet, the photo and answers split 5 : 7, the photo sticky.
- **Results:** the register spans the full width, then the question map in four columns (number, prompt, bar, mistakes).
- **Split pages:** content beside a 340 px side column (gap 24 px).
- **Welcome:** headline and actions beside a live register excerpt (1.05 : 1, gap 48 px), then the three class covers in a 3-up grid (gap 16 px).

Spacing runs on a 4 px base: 4, 8, 12, 16, 20, 24, then 36 px between sections and 32 px for large breaks. Panels pad 20 px; dense rows pad 8 to 12 px vertically. Register rows are 38 px high with 8 px cell padding.

Responsive steps: at **1080 px** split pages, the sheet view and the welcome hero go to one column (the photo stops being sticky). At **860 px** Check's question list becomes a horizontal scroll strip, covers and the three-part strip stack, the context bar wraps, and horizontal scrollers (step tabs, welcome register) fade at the right edge as a scroll cue. At **640 px** the top bar compresses to short labels, the answer key table becomes stacked blocks, and sheet tiles go two-up. The answer list uses a container query at 760 px so answer actions drop under the reading. On coarse pointers, targets grow to 44 px and keyboard legends are hidden.

## Elevation & Depth

The system is flat and ruled. Depth comes from paper against paper: sheet-white surfaces on cool paper, 1 px hairlines and the tint step to sheet-2. Sticky register headings, the name column and the foot row hold their place with solid surfaces, not shadows. One soft shadow token is used for things that sit above the page.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 1px 2px rgba(23, 32, 58, 0.06), 0 6px 16px -8px rgba(23, 32, 58, 0.22)`; dark: `0 1px 2px rgba(0,0,0,.4), 0 8px 20px -10px rgba(0,0,0,.7)`): the welcome register excerpt, class covers, the toast, the skip link, the current question in the question list, and a sheet tile on hover.
- **Cover hover** (`0 2px 4px rgba(23, 32, 58, .1), 0 14px 26px -12px rgba(23, 32, 58, .45)` with a 2 px rise): a class cover under a real pointer.
- **Focus ring** (`outline: 3px solid` focus, offset 2 px; fields use 2 px with no offset): every keyboard-focusable element.

### Named Rules
**The Flat Register Rule.** Working surfaces (panels, the register, answer rows) never take a shadow. Only things that float or are lifted for a pointer do, and touch screens drop hover lifts.

## Shapes

Corners are small and practical: 6 px on controls and callouts, 10 px on panels, tiles, the register frame and the drop zone, 4 px on photo crops and keyboard keys, 3 px on flags. Chips, pills, status lights and progress bars are full pills. A class cover has a book-spine silhouette (4 px on the bound edge, 10 px on the open edge), and the small class covers on the Classes list use the same silhouette at 2 px / 6 px.

The marks are drawn, not typeset: round-capped SVG strokes on a 26-unit grid, 2.6 wide in ink and 2.2 wide dashed 3 / 2.5 in pencil. The score is ringed by one loose hand-drawn ellipse. Hatching is a recurring texture with fixed meanings: single 135° hatch is a cell waiting for the teacher, crossed hatch is Nano unsure, a red hatch is "partly right" in the question bar, and a grey hatch marks a value withheld so no small group can be identified.

### Named Rules
**The Shape Is Meaning Rule.** Tick, cross, half-tick, dash and question mark are distinct shapes, solid is decided and dashed is suggested, so the register reads correctly in greyscale and for colour-blind teachers.

## Components

### Buttons
Plain and sturdy, like the buttons on a school form.
- **Shape:** gently squared (6 px), 40 px high, 8 × 16 px padding, weight 600, icon gap 8 px.
- **Default:** sheet white with a strong hairline border and ink text; hover tints to sheet-2 with an ink-quiet border.
- **Primary:** navy fill with cover-ink text; hover lifts to cover-2. One per region.
- **Ink:** red fill with white text, only on the action that writes a red mark ("Ink 1/2"). Hover brightens slightly.
- **Quiet:** no border or fill, muted text; tints on hover.
- **Destructive:** looks like Default (grey outline, muted text); the confirmation step carries the danger, not colour.
- **Small:** 32 px, 4 × 10 px, 0.875rem. **Icon button:** 36 px square, transparent, 20 px icon.
- **States:** press moves down 1 px and scales to 0.98; disabled is 50% opacity. Keyboard hints sit inside the button as outlined key caps. On touch, all buttons are at least 44 px and hover colours do not stick.

### Chips
- **Ink chip:** red wash with red text and a short solid red bar before the label. It names a question type code marks, and "Marked by code".
- **Pencil chip:** pencil wash, graphite text, a short dashed bar before the label. It names a type Nano suggests.
- **Where pill:** a 7 px dot plus label; teal for "On this laptop", slate for cloud or recorded readings, plain grey for "Typed in".
- **Flag:** square-cornered highlighter (3 px), bold, for things the teacher must check. The soft flag counts what is waiting.

### Cards / Containers
- **Panel:** sheet white, 1 px hairline, 10 px corners, 20 px padding, no shadow. Flush panels hold ruled rows edge to edge.
- **Callout:** sheet-2 ground, 6 px corners, 12 × 14 px padding, a 20 px icon; device (teal wash), warn (highlighter wash) and bad (red wash) variants.
- **Sheet tile:** 8 px padding around the photo at the answer sheet's fixed aspect (1100 : 1492) with its score ring pinned top right and a strip of small marks; teal border while reading, highlighter while fresh.
- **Ruled row:** ledgers, the question map and the answer key are rows separated by hairlines, not cards.

### Inputs / Fields
- **Style:** 40 px high, sheet white, 1 px strong hairline, 6 px corners, 8 × 10 px padding, 16 px text; labels above in 600 at 0.9375rem with a muted 0.8125rem hint.
- **Focus:** 2 px focus-blue outline and border.
- **Error:** red border plus a 1 px red ring, with a red line of text under the row.
- **Segmented control:** joined buttons on a hairline; the pressed one fills navy.
- **Stepper:** outlined, 32 × 30 px drawn-icon buttons around a bold value (40 px on touch).

### Navigation
- **Top bar:** navy, 56 px, sticky. The brand (logo + 1.15rem bold word), then Classes and Privacy in cover-ink-2 with a 3 px cover-ink underline and bold weight when current. On the right: the on-device status light (a pill on cover-2 with a coloured dot: teal ready, yellow downloading or limited, pink stuck, grey none), the cloud counter ("Sent to cloud", "Pupil photos sent" with a teal zero), and the theme toggle. At 640 px labels shorten and the word mark hides.
- **Context bar:** white under the navy, quiz title (title size), then the class name as a muted link, then the step tabs. Tabs are muted text with a 3 px underline in navy when current, plus a highlighter count of what waits on Check.
- **Question list (Check):** a sticky vertical list of question number, type and waiting count; the current one is lifted onto sheet white with a hairline outline. Below 860 px it becomes a horizontal strip of outlined buttons.

### Marks (signature)
The mark in a cell is 28 px (32 px in the answer margin, 20 × 22 px on a tile). Ink is a solid red stroke; pencil is a dashed graphite stroke with its figure in Kalam 400. "Needs you" adds a highlighter square under the mark at 55% opacity. **Pencil to pen:** when a teacher confirms a suggestion, the dashed pencil stays as a ghost while the red stroke draws over it in 250 ms (`cubic-bezier(.3, .7, .4, 1)`, a second stroke 100 ms later) and the ghost fades in 180 ms. Under reduced motion the mark simply changes.

### Score Ring
The total in Kalam inside a hand-drawn red ring (74 × 46 px; 104 × 64 px large). An undecided total is graphite with a dashed ring and a small "so far" under it. The ring draws in 450 ms when the total settles.

### The Register
The class-by-question grid: a sticky name column (180 to 240 px, 130 to 150 px on phones) with a strong right rule, sticky headings with the question number over a quiet type caption, 38 px rows, and a sticky foot row on sheet-2 with each column's full-marks rate. Wrong cells are washed red, partly right cells half that, waiting cells hatched in pencil, unsure cells cross-hatched, and a cell to look at has a 3 px highlighter underline. A row that just changed keeps a highlighter tint on its name until visited. Totals are right-aligned behind a strong left rule.

### Answer Row (Check)
A ruled row: a 64 px margin holding the mark and the points in red Kalam, behind a red margin rule (stronger on the focused row); then the name, the photo crop at one fixed scale, the reading, Nano's one-line reason in graphite italic, and the key-point toggles; then the actions. The focused row tints to sheet-2 and opens the full reason and toggle text. Key-point toggles are outlined pills that turn dashed graphite while suggested and red when inked.

## Do's and Don'ts

### Do:
- **Do** make the register (or a ruled list) the first thing on a working screen, with one dominant work region taking most of the width.
- **Do** draw every new mark state as its own shape and stroke (solid for decided, dashed for suggested), so it reads in greyscale.
- **Do** keep red for marks, scores, point totals, the margin rule, the "Ink" chip and the inking action only (the Red Ink Rule).
- **Do** show yellow only where the teacher must act, and teal or slate only to say where data was processed.
- **Do** use Atkinson Hyperlegible with tabular figures for every label and number, and Kalam only inside marks and scores.
- **Do** keep working surfaces flat: sheet white, 1 px hairlines, 6 px controls, 10 px panels; use the Lift shadow only for floating things.
- **Do** give every motion a reduced-motion path, and keep 44 px targets and hidden keyboard legends on coarse pointers.
- **Do** define both themes from the same token names; never hard-code a light-only colour in a component.

### Don't:
- **Don't** build KPI tiles, stat-card rows or dashboard cards; put counts in a sentence or the register's foot row.
- **Don't** use red for tabs, navigation markers, delete buttons, confirmations or decoration.
- **Don't** set sentences, reasons, question numbers or headings in Kalam.
- **Don't** credit cloud Gemini output to Gemini Nano, or colour a cloud reading teal.
- **Don't** add uppercase eyebrows or kickers above headings; the context line goes after the heading.
- **Don't** put shadows on panels, rows or the register, or lift on hover on touch screens.
- **Don't** use text glyphs ("−", "+", "✓") as icons; use the drawn 24-unit, 1.8-stroke icon set.
