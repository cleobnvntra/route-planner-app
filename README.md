# Route Planner

Finds the shortest rental truck route through depots that are open and accept the job's materials.

## Setup

Needs Node 24 or newer (`check-sources` runs TypeScript directly).

1. `npm install`
2. Copy `.env.example` to `.env` and set:
   - `ORS_API_KEY`: free Standard key from a HeiGIT account (account.heigit.org/signup)
   - `APP_PASSWORD`: the shared password
3. `npm run dev`

## Build the Android app

`npm run apk` runs the tests and writes the signed app to `release/route-planner-app.apk`.

It needs Java 21 and the Android SDK. The script looks in `%LOCALAPPDATA%\route-planner-build\jdk-21` (or `ROUTE_PLANNER_JAVA_HOME`) and `%LOCALAPPDATA%\Android\Sdk` (or `ANDROID_HOME`).

**Releasing an update:**

1. Raise `versionCode` in `android/app/build.gradle`.
2. Run `npm run apk`.
3. Install the new APK on each phone.

**Back up `signing/`.** Android only accepts updates signed with the same key. It's ignored by git, so it won't be backed up with the code.

## Website fallback (not deployed)

The `api/` and `server/` code and the PWA setup are kept in case the app moves to hosting. Vercel's free plan is limited to non-commercial use, so check its terms first. Set `ORS_API_KEY` and `APP_PASSWORD` on the host.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Unit and API tests |
| `npm run apk` | Tests, then builds the signed Android app |
| `npm run build` | Typecheck and production build of the website version |
| `npm run check-sources` | Checks if the City pages changed. Exit 0 unchanged, 1 changed, 2 could not check |
| `npm run check-sources:accept` | Saves the current page hashes. Run only after re-verifying `stations.json` |

## Updating stations

Edit `src/data/stations.json` by hand and set `lastVerified`. Then run `npm test`: it validates the file and pins the City facts, so update those tests if the City's rules changed. Bad data stops the app with a clear error rather than giving wrong routes. The change reaches the phones only after you release a new APK.

## Layout

- `src/model/`: pure logic and types (`planner.ts` is the core)
- `src/controller/`: React hooks and the API client
- `src/view/`: components
- `android/`: the Capacitor Android project
- `server/`: address search and routing (`photon.ts`, `ors.ts`, used by the APK too), plus the website's password check and validation
- `api/`: website functions, not used by the APK
