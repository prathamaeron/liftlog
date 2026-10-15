# LiftLog

A personal workout tracker that runs in the browser on your phone and laptop. Plain HTML, CSS and JavaScript with no build step, hosted on GitHub Pages and synced through a private GitHub repo.

## Features

- **Templates.** Named, ordered exercise lists with target sets and reps, for example "Push Day: Bench 3×6-8".
- **Workout logging.** Start from a template and every set is pre-filled with what you did last time. Tap ✓ to confirm a set, or adjust weight and reps. Includes a workout clock, a rest timer, and the ability to add, swap or reorder exercises mid-workout.
- **Strength and bodyweight exercises.** Bodyweight moves (pull-ups, dips) log reps with optional added weight.
- **Units.** Switch between lb and kg anywhere. Weights are stored precisely in kg, so switching never loses accuracy, and the other unit is shown under each weight while you log.
- **Progress.**
  - Per exercise: estimated 1RM, top weight, volume and reps charts, plus personal records and full history.
  - Per template: volume, sets, reps and duration over time, and how much each exercise has improved.
- **Bodyweight tracking.** Log entries, see a trend chart, a 7-day average and your 30-day change.
- **Session notes**, and editable history: fix any past workout, change its date or duration, or log one after the fact.
- **Backups.** JSON export and import (import merges with existing data), and a PDF report with summary stats, PRs, trend charts, bodyweight and the full workout log.
- **GitHub sync.** All data lives in one JSON file in a private repo you own, so your phone and laptop stay in sync.
- **Installable and offline.** It's a PWA: add it to your home screen and it works at the gym without signal. Changes sync when you're back online.

## Project layout

```
index.html              app shell
css/styles.css          all styling (dark by default, light mode supported)
js/app.js               router and global wiring
js/store.js             data model, local storage, units, merge logic
js/sync.js              GitHub sync
js/stats.js             1RM, volume, PRs, summaries
js/charts.js            SVG line charts
js/export.js            JSON and PDF export
js/ui.js                bottom sheets, exercise picker
js/views/*.js           one file per screen
sw.js                   service worker (offline cache)
manifest.webmanifest    PWA manifest
vendor/                 jsPDF + AutoTable (only loaded when exporting a PDF)
icons/                  app icons
```

## 1. Run it locally

ES modules need to be served over HTTP; opening the file directly won't work. From this folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## 2. Host it on GitHub Pages

1. Create a repository for the **app code**, for example `liftlog`. It can be public; your workout data does not go in this repo.
2. From this folder, make the first commit and push:
   ```bash
   cd ~/Documents/GitHub/liftlog
   git init -b main
   git add -A
   git commit -m "LiftLog v1"
   git remote add origin https://github.com/<you>/liftlog.git
   git push -u origin main
   ```
   (Or in GitHub Desktop: File → Add Local Repository → choose this folder → Publish.)
3. On GitHub, go to **Settings → Pages**. Set Source to "Deploy from a branch", Branch to `main`, and folder to `/ (root)`, then save.
4. After a minute the app is live at `https://<you>.github.io/liftlog/`.

## 3. Set up sync (once per device)

1. Create a second repository, **private**, for your data, for example `liftlog-data`. Tick "Add a README" so it has a `main` branch.
2. Create a token: **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - Repository access: *Only select repositories* → `liftlog-data`
   - Permissions: *Repository permissions → Contents: Read and write*
3. In LiftLog, open **Settings → GitHub sync**, enter your username, `liftlog-data`, and the token, then tap **Save & connect**.
4. Repeat step 3 on your other device.

How sync works:
- It runs automatically when the app opens, when you come back to it, a few seconds after each change, and when you reconnect to the internet.
- Each record (exercise, template, workout, bodyweight entry) merges independently, and the most recent edit wins. Deletions sync too.
- The token is stored only in that browser's local storage and is sent only to `api.github.com`.

## 4. Install on your phone

- **iPhone (Safari):** open the site, tap Share, then **Add to Home Screen**.
- **Android (Chrome):** open the site, tap ⋮, then **Install app**.

## Updating the app

After changing code, bump `VERSION` in `sw.js`, for example `liftlog-v2`, so installed copies download the new files. Updates apply on the next launch after the app has fetched them.

## Data format

`liftlog-data.json` has one object per collection, keyed by id. Weights are in kilograms. Each record carries `updatedAt`, and deleted records become `{ id, deleted: true, updatedAt }` tombstones so deletions sync.

```json
{
  "settings":   { "unit": "lb", "updatedAt": 0 },
  "exercises":  { "<id>": { "name": "Bench Press", "type": "weighted" } },
  "templates":  { "<id>": { "name": "Push Day", "items": [{ "exerciseId": "...", "sets": 3, "reps": "6-8" }] } },
  "sessions":   { "<id>": { "name": "Push Day", "templateId": "...", "date": 0, "startedAt": 0, "finishedAt": 0, "notes": "",
                            "entries": [{ "exerciseId": "...", "sets": [{ "weightKg": 70.3, "reps": 8, "done": true }] }] } },
  "bodyweights":{ "<id>": { "date": 0, "weightKg": 80.5 } }
}
```

## Ideas for later versions

- Progression hints, for example "hit the top of the rep range on every set, so add 5 lb"
- Plate calculator
- Supersets
- Warm-up set flag
- Port to a framework (Vite + Preact/React) or a hosted database if needed
