---
version: 1
slug: "src-ui-app-tsx"
primary_target: "src/ui/App.tsx"
related_targets: ["src/styles.css"]
---

# Tickmark app shell and marking screens

Scope: every screen of the web app (welcome, classes, new quiz, sheets, check, results, plan lesson, privacy). Visitor mode: Operate (the welcome page leans Persuade inside the same world). Code-led.

Audience and job: a teacher marking a class pile in the evening; a judge trying a sample class. Task: read the sheets, decide what the AI only suggested, see what the class got wrong, plan tomorrow. Constraints: keyboard-first checking, Indian scripts, phone-width use, no student data leaves the laptop.

Run notes: the owner asked not to be asked anything, so the decision page was not served and the assigned direction was built unattended. All six dealt challengers declined.

## Direction contract

THESIS: The teacher's mark register. One grid of the class list against the questions, where every mark shows who made it: code and the teacher write in red ink, Gemini Nano writes in pencil. This refuses the SaaS dashboard of cards and KPI tiles.

OWN-WORLD: The register-cover navy shell (top bar and side context) over cool white paper; red ink only for marks; graphite grey for suggestions; highlighter yellow only for "needs you"; teal for on this laptop, slate for the cloud. Atkinson Hyperlegible for every label and number (tabular figures), with Kalam only for the marks themselves. Dense rows (36 px), with the class list down the left and question columns across.

STORY: The visitor sees the class's marks, sees which ones are still pencil, decides them one key at a time, then sees the mistakes the class made and plans a lesson from totals that carry no names.

FIRST VIEWPORT: Welcome: the headline on the left, then the three sample classes as large doors, each with its subject, size and question types. On the right, a live register excerpt shows pencil marks turning to ink. On working screens: a navy top bar (brand, class and quiz switcher, step tabs, on-device status, a cloud counter), then the screen's one dominant work region.

FORM: the teacher's mark register, candidate 3 of 7 (exercise book, answer-script cover, mark register, chalkboard, report card, textbook, notice board). seed:f0bb8e1ef213a4d6

Signature move: pencil to pen. A suggested mark is drawn in graphite (Kalam, light, a cross-hatched cell for "Nano unsure"). On confirmation it redraws as a red-ink stroke in 250 ms; under reduced motion it changes without drawing.

Raises kept from the declined challengers:
- Exposure record (named discipline: conflict without colour): a second read that disagreed, or Nano being unsure, shows as a cross-hatched cell as well as a label.
- Labanotation (shape is meaning): tick, cross, half-tick and ring are distinct shapes, so status reads in greyscale.
- Zoo guide map (one dominant region): each screen gives one work region the majority of the width.
- Botanical folio (fixed scale): every sheet thumbnail and every mark is drawn at one registered scale, so it compares directly.
- Gate board (rows change in place): a sheet read or a mark changed updates its row in place and keeps a highlighter tint until the teacher visits it.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
- Phone flow: photos are taken on the phone; reading needs Nano on a laptop. The phone gets the full app, with typed answers and checking.
