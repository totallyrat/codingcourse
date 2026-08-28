# Codeling

**Learn to code the way you learn a language.** A desktop trainer that builds you a
course, gives you a short lesson a day, and re-asks anything you get wrong in the
very next lesson.

No account. No subscription. No AI service and no API key — the "intelligence" is a
set of scoring functions over a library that ships inside the app. It works with the
network unplugged.

```
13 tracks   ·   82 skills   ·   235 concepts   ·   438 exercises   ·   10 element types
```

---

## Getting it

### Install it (Windows, macOS, Linux)

Grab the installer for your platform from the
[Releases page](../../releases/latest) and run it. On Windows that is
`Codeling-Setup-<version>-x64.exe`, a normal installer wizard: choose a folder,
get a desktop and Start-menu shortcut, uninstall from Settings like anything else.

> Builds are unsigned, so Windows SmartScreen shows a warning the first time.
> "More info" → "Run anyway", or build it yourself from source below.

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
3. **JavaScript and TypeScript always run**, on Electron's own Node.
4. **Otherwise, structure checks only** — and the badge says exactly that rather
   than pretending the program ran.

---

## How it is put together

```
electron/        main process: window, menu, atomic JSON persistence, code runner
src/engine/      types, course builder, SM-2 scheduler, lesson composer, grader
src/runtime/     MiniPy interpreter, TypeScript stripper, unified run entry point
src/content/     13 tracks — the whole library, as plain data
src/components/  the ten exercise elements
src/mascot/      Bit
src/screens/     wizard, home, lesson, results, progress, library, settings
```

**Bit**, the mascot, runs on one `requestAnimationFrame` loop writing SVG
attributes directly — no React renders. A critically-damped spring drives the
body so every reaction overshoots and settles; the antenna is a four-point Verlet
chain that only ever responds to where the head has been, which is what makes it
read as physical; squash and stretch comes from vertical velocity. It watches
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
npm test         # 180 tests
npm run build    # typecheck + bundle
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
