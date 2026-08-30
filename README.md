# Codeling

**Learn to code the way you learn a language.** A desktop trainer that builds you a
course, gives you a short lesson a day, and re-asks anything you get wrong in the
very next lesson.

No account. No subscription. No AI service and no API key — the "intelligence" is a
set of scoring functions over a library that ships inside the app. It works with the
network unplugged.

```
13 tracks · 113 skills · 325 concepts · 748 exercises · 10 element types · 10 levels
```

One app, one shape. It is a phone app you install from the browser — no store,
no account — and the Windows, macOS and Linux builds run the same phone-shaped
UI in a window locked to those proportions.

---

## Getting it

### Install it (Windows, macOS, Linux)

Grab the installer for your platform from the
[Releases page](../../releases/latest) and run it. On Windows that is
`Codeling-Setup-<version>-x64.exe`, a normal installer wizard: choose a folder,
get a desktop and Start-menu shortcut, uninstall from Settings like anything else.

> Builds are unsigned, so Windows SmartScreen shows a warning the first time.
> "More info" → "Run anyway", or build it yourself from source below.

### Put it on your phone

**<https://totallyrat.github.io/codingcourse/>** — open that on the phone and add
it to the home screen. On iPhone: Share → **Add to Home Screen** → Add. On
Android, Chrome offers **Install app** by itself. The app says so too, the first
time you finish a lesson.

Installed, it is a real app: its own icon, its own launch screen, full screen
with no browser chrome, and **it works with no network at all** — the lessons,
the Python interpreter and the typefaces are all stored on the device the first
time it loads. Nothing needs an account and nothing leaves the phone.

> **On the EU's alternative app stores.** The DMA did open iOS to other
> marketplaces, but the door has a height limit: Apple requires an
> *organisation* developer account that has existed for two continuous years
> and an app with over a million first installs in the EU in the previous
> calendar year, and every build still goes through Apple's notarisation. A new
> app cannot qualify, in the EU or anywhere else. A home-screen install needs
> none of it — no developer account, no notarisation, no annual fee — which is
> why that is the route this app takes.

### Run it from source

You need [Node.js](https://nodejs.org) 20 or newer.

**Windows** — double-click `start.bat`.
**macOS / Linux** — run `./start.sh`.

Either script installs dependencies on first run and then opens the app. The long
way round is the same thing:

```bash
npm install
npm run dev
```

### Build your own installer

```bash
npm run dist:win     # Windows NSIS installer
npm run dist         # whatever platform you are on
npm run pack         # unpacked app directory, no installer
```

Output lands in `release/<version>/`.

---

## What it does

### The setup wizard

Six questions — what you want to build, how much you have done before, what you
already know, how many minutes a day, what interests you — and then it shows its
working:

- **which tracks fit, and why.** Every track is scored against your answers:
  goal alignment (0.40), interest overlap (0.22), how steep it is versus your
  stated experience (0.20), and transfer from languages you already know (0.18).
  You see the percentage and the reasons, and you can ignore all of it and pick
  something else.
- **the course it generated,** unit by unit, before you commit to it. Two people
  choosing Python get the same skills in a different order.

### The ten-level ladder

Every exercise sits on a level from 1 to 10 — authored where it matters,
otherwise derived from how hard it is and how far into the track its skill
sits. The learner has a level **per course**, and a lesson is drawn at it, with
a single item from the rung above as the question they are allowed to fail.
Early lessons are short (seven items at level one, sixteen at level ten),
because seven you can answer beats sixteen that grind you down.

Moving up is evidence, not luck:

- a **run** of strong lessons at the current level — two at the bottom, four
  near the top — promotes you;
- **one** weak lesson only resets the run, because one lesson is noise;
- two struggling lessons in a row eases the ladder back down a rung;
- a lesson that was all easy revision **cannot** promote you at all, however
  well it went. That is the difference between "ready for the next rung" and
  "had an easy day";
- unless the library genuinely had nothing at your level left to give, which
  the composer reports. A skill whose material all sits above you would
  otherwise wall the course off for good: never served, so never mastered, so
  the syllabus never moves on — and no at-level items, so the ladder can never
  lift you over it either. A flawless lesson clears that, which is a higher bar
  than the 85% the normal path asks for.

A learner who answers everything correctly finishes every skill of every track,
and [the test that proves it](src/engine/engine.test.ts) plays all thirteen
through to the end on every run.

### The scheduling algorithm

Everything adaptive lives in [`src/engine/`](src/engine). It is deterministic,
readable, and about six hundred lines.

**Course building** ([`courseBuilder.ts`](src/engine/courseBuilder.ts))
Each track is a small DAG of skills. The syllabus is Kahn's algorithm over that
graph, and where several skills are unblocked at once the tie is broken by a fit
score from your wizard answers. Fundamentals are never dropped — they just stop
being the headline for somebody who already writes code, who gets them
pre-credited instead.

**Memory** ([`scheduler.ts`](src/engine/scheduler.ts))
A modified SM-2, with two deliberate departures:

1. Intervals are counted in **lessons, not days**. The app has no idea when you
   will next open it, and a review scheduled for "3 days" that lands in the
   middle of a Sunday binge helps nobody.
2. **A wrong answer is always due again in the next lesson.** The interval is
   forced to 1 and the exact item you missed goes onto a queue — not merely its
   concept. Miss it twice and it is pinned again, and one lucky answer will not
   clear it.

Mastery also **decays**. A skill you crowned a month ago and never revisited
reads as faded rather than finished, because that is the truth.

**Lesson composition** ([`lessonComposer.ts`](src/engine/lessonComposer.ts))
Picking ~13 items out of hundreds, in this order: rechecks first (capped at 40%
of the lesson, so one bad day does not turn the next session into a wall of your
own mistakes), then due reviews weakest-first, then new material from the current
skill, then one stretch item if you have earned it. The result is arranged for
pacing — a gentle warm-up, never three of the same element type in a row, and the
hardest item never last.

It is seeded from your profile id and the lesson number, so re-opening a lesson
gives you the same lesson.

### Gems and the shop

Lessons pay gems (twelve, twenty for a perfect one). The shop sells five
things, and every one of them maps onto a mechanic that already exists rather
than being a number that only moves in the shop:

| | |
|---|---|
| **Streak Saver** | one more of the freezes the scheduler already spends for you |
| **Super Boost** | double XP for three lessons |
| **Instant XP** | 150 XP, counted towards today's goal |
| **Lesson Skip** | credits a skill as passed — it still comes back for review |
| **Mystery Chest** | one of the other four, resolved in the engine on purchase |

Finished quests pay chests too, and they stack up on the Quests tab until you
open them — which is not a formality. A chest takes between five and fifteen
hits: it shakes harder each time, the light grows through the seams, and then
it goes, lid spinning off, and the item is thrown up out of it and lands in
front of you. The number of hits is rolled per chest, and what is inside is
rolled by the engine at the moment the lid goes, so nothing on screen knows the
answer any earlier than the person tapping does.

### Quests, and the league

Ten quests a week, generated from your profile id and the Monday date, so
everyone's week is different and yours is the same on every device. They ask
for things the app already counts — 40 XP, three lessons, 80% in a lesson, a
skill past 75%, a level climbed — and finishing one pays a chest. They update
while you watch, on the profile screen, straight after a lesson.

Quests have their own tab: the week's count, the time left, the chests waiting,
and ten bars. The league ranks you against fifteen simulated learners on **XP earned since
Monday**. Everyone shows zero at the start of the week; your real total is
never touched. The bots are generated on the device from your id and the week,
each with its own pace, so the table is different every week and stable within
it. Nothing is uploaded — there is no server to upload it to, and the screen
says so.

### Hard Mode

Finish a lesson without a single mistake and it is not over. A card takes the
screen — *not one mistake* — and three more questions arrive, drawn a rung
above the one you are on. They cost no hearts and cannot spoil the lesson you
have already won: they pay **double XP**, they count as the strongest evidence
the ladder can get, and the celebration reports them on their own line. They
are composed with the lesson rather than after it, so a lesson is still one
deterministic object and the player only decides whether to play them.

### After a lesson

The celebration screen is one mascot, one line, and three numbers. Pressing
Continue drops you on your profile with the numbers **still where they were
before the lesson**, and then releases them: today's XP, your level, the course,
the ladder, then your strongest skills, then what needs work — the page
scrolling itself down to each group as it moves — and then the app walks over
to the Quests tab and does the same there. You watch the lesson you just did
land, rather than finding it already landed.

### Everything answers back

A lesson is full of things to touch, and every one of them replies. A press
sends a ring out from under the finger; a selection pops; a right answer swells
once and throws a small burst of paper; a wrong one shakes. It is all transform
and opacity — no layout is animated — and all of it stops dead when the system
asks for reduced motion.

Opening the app plays a short piece of its own: a ring drawing itself, the
mascot landing inside it, the name arriving a letter at a time, and then the
whole thing lifting away. It runs over the profile being read off disk, so the
wait it covers is one that was happening anyway, and it is gone in under two
seconds.

### When you are stuck

"I am stuck" does not skip the question. It gives you a hint, then how to
approach that kind of exercise, then a genuine narrowing of the search — two
wrong options eliminated, the number of tiles and the first one, the length of
the blank and its first character, which half of the code holds the bug. The
question stays open and answerable the whole time. Only "show the answer",
offered last, gives up — and it counts the item wrong and puts it back in the
next lesson, which the screen says plainly.

### Blueprints, the way the editor does them

The Unreal course teaches Blueprints as Blueprints, not as a diagram of them.
Pins carry types and Unreal's own colours — white exec arrows, green floats,
cyan ints, pink strings, blue objects, red booleans — and a wire that could not
compile is refused with the reason ("a float pin does not connect to an
execution pin"), the way the editor refuses it. The two conversions Unreal
inserts silently, float into string and int into float, are allowed here too.

The canvas pans and zooms like the editor's viewport: one finger drags, two
pinch, `+` / `−` / **Fit** sit over the graph, and a wide graph opens at a
readable scale instead of being fitted into an unreadable strip. Two skills —
reading a Blueprint and building one — cover pin types, get and set, pure
functions, casting, macros and loops, delays, and timelines.

### Your own mascot

The avatar creator builds one from the same parts the cast is drawn from: head
shape, colour, eyes, mouth, what sits on the head, arms, an outfit and its
colour, and a name. It runs the same rig, so your mascot springs, blinks and
trails its antenna exactly as the others do. It is who you are in the league,
on your profile, and at the end of a lesson.

### Reminders and haptics

Both do what the platform actually allows, and the settings screen says which:

- **Haptics.** Vibration where the browser has it. On iPhone there is no
  vibration API, so the app borrows the tick a `<input type="checkbox" switch>`
  makes and clicks a hidden one inside your tap — which is why it only fires on
  a real gesture.
- **A daily reminder** at a time you pick, skipped on any day you have already
  practised. On Chromium, installed, it registers a periodic background sync so
  the reminder can fire while the app is closed. Everywhere else it can only
  fire while the app is open, and the screen tells you that rather than
  promising a notification that will not come.

### The cast

Five characters share one animation rig: a critically damped spring for the
body, a Verlet chain for whatever is on their head, squash and stretch from
vertical velocity, eyes that track and blink on their own schedule. Only the
drawing changes — silhouette, palette, accessories. **Bit** runs the place,
**Pip** cheers, **Byte** keeps the streak, **Nib** marks the mistakes and
**Loop** brings back what you missed. One of them turns up to celebrate at the
end of every lesson — or your own mascot does, if you have made one.

### The ten element types

| | |
|---|---|
| **Choose** | multiple choice, answerable with the number keys |
| **Build the line** | tap or drag code tiles into order |
| **Put in order** | drag whole lines; Space then arrows also works |
| **Fill the gaps** | inline inputs sized to the answer they expect |
| **Write and run** | a real editor; the program actually executes |
| **Match the pairs** | two columns, wrong pairs bounce apart immediately |
| **Predict the output** | read the code, say what it prints |
| **Find the bug** | click the broken line, then say why |
| **Wire the graph** | connect Blueprint nodes pin to pin |
| **Run a command** | type into a simulated shell |

Every one has a keyboard path. Nothing is mouse-only.

### Running code, honestly

"Write and run" really runs, and the badge always says how:

1. **A real toolchain on your machine.** Detected at startup — `python3`, `node`,
   `g++`, `rustc`, `go`, `dotnet script`. Your code runs in a throwaway temp
   directory with an 8-second limit and a 64 KB output cap.
2. **The bundled Python interpreter.** No Python installed — which is most
   Windows machines — and [`minipy.ts`](src/runtime/minipy.ts) takes over: a
   tree-walking interpreter for the subset the course teaches, with the int/float
   distinction, f-strings, comprehensions, classes and about forty builtins. It
   is checked against real CPython by
   [26 differential tests](src/runtime/minipy.parity.test.ts).
3. **JavaScript and TypeScript always run.** On the desktop, on Electron's own
   Node. On a phone, in a Worker built from a blob — the learner's code is
   pasted in as source rather than handed to `eval`, so the page needs no
   `unsafe-eval`, and a `while (true)` is dealt with by terminating the worker
   rather than by hoping.
4. **Otherwise, structure checks only** — and the badge says exactly that rather
   than pretending the program ran.

---

## How it is put together

```
electron/        main process: window, menu, atomic JSON persistence, code runner
src/engine/      types, course builder, SM-2 scheduler, lesson composer, grader,
                 the ladder, quests, the league, stuck-tips, pin rules
src/runtime/     MiniPy interpreter, TypeScript stripper, browser JS sandbox
src/content/     13 tracks — the whole library, as plain data
src/components/  the ten exercise elements
src/screens/     wizard, lesson, library, settings
src/mascot/      the cast, and the one rig they all run on
src/mobile/      the shell: course path, league, shop, profile, quests,
                 avatar creator, celebration, reminders, tab pager
```

There is one UI. The phone build and the desktop build load the same shell —
the desktop window is simply locked to a phone's aspect and keeps its own
title bar. That means one layout to design, one set of gestures to keep
working, and no second-class version.

The shell is built for a thumb: five tabs you can swipe between with the
indicator tracking your finger, the course as a **path** you scroll — big
round lesson nodes weaving down the screen, a card that opens over the one you
press, section banners and a trophy at the end of each — sheets you throw away
downwards, safe areas honoured on a notched screen, haptics on every answer,
and, because there is no cursor for the mascots to watch, the option to let
them follow the tilt of the phone instead.

**Bit**, the mascot, runs on one `requestAnimationFrame` loop writing SVG
attributes directly — no React renders. A critically-damped spring drives the
body so every reaction overshoots and settles; the antenna is a four-point Verlet
chain, solved in the svg's own coordinates and pinned to that species' head, so
it only ever responds to where the head has been — which is what makes it read
as physical; squash and stretch comes from vertical velocity. It watches
your cursor, blinks on its own schedule, and its antenna ends in a text caret
that blinks at terminal cadence. It honours `prefers-reduced-motion`.

### Your data

One JSON file in your OS user-data directory (`%APPDATA%\Codeling` on Windows;
Settings shows you the exact path). Written atomically via a temp file and a
rename, so a crash mid-lesson cannot corrupt a 40-day streak. Export and import
are in the File menu. Nothing leaves the machine.

---

## Development

```bash
npm install
npm run dev      # app with hot reload
npm test         # 221 tests
npm run build    # typecheck + bundle (desktop)
npm run dev:mobile   # the phone build, with hot reload
npm run build:mobile # phone build + generated service worker -> dist-mobile/
npm run icons        # re-render the app icon and the iOS launch screens
```

The test suite is the interesting part:

- **`src/engine/engine.test.ts`** — the scheduler's contracts, including that
  every wrong answer really does come back next lesson, that rechecks stay
  capped, that no lesson reaches past the learner to pad itself, and that a
  lesson never puts three identical element types in a row.
- **`src/runtime/minipy.parity.test.ts`** — every snippet run through both
  CPython and MiniPy, asserting identical output. Skipped automatically when
  Python is not installed.
- **`src/content/solutions.test.ts`** — compiles and runs **every reference
  solution** against its own test cases, in C++, Rust, Go, Python, JavaScript and
  TypeScript, and separately checks that no starter already passes. The worst bug
  a teaching app can have is one where the correct answer is marked wrong.
- **`src/runtime/stripTypes.test.ts`** — mostly cases a naive type-stripper gets
  wrong: object literals, ternaries, switch labels, labelled loops.

### The phone build

`npm run build:mobile` runs the bundle and then writes `dist-mobile/sw.js` from
the file list of that exact build — hashed names and all — so the precache is
the real output rather than a guess that quietly rots. The icons and the twelve
iPhone launch screens are rendered from
[`assets/icon.svg`](assets/icon.svg) by headless Chromium
([`scripts/build-icons.mjs`](scripts/build-icons.mjs)) and committed, so no
image library is needed to build the app.

Pushing to the default branch deploys it to GitHub Pages
([`.github/workflows/pages.yml`](.github/workflows/pages.yml)).

### Adding content

A track is one file in [`src/content/tracks/`](src/content/tracks): some skills
with prerequisites, and a list of exercises. Add it to
[`src/content/index.ts`](src/content/index.ts) and the tests will tell you if a
skill is too thin, an answer index is out of range, a wire links to the wrong
pin, or an exercise is missing its explanation.

---

## Licence

MIT. Bundled typefaces (Instrument Serif, Inter, JetBrains Mono) are used under
the SIL Open Font License 1.1.
