# Test harness

Two optional scripts used while building the app. They run against a **running server**
(`npm start` in another terminal).

```bash
npm start                        # terminal 1
npm i --no-save jsdom            # dev-only dependency
node testtools/smoke.js          # boots the real PWA in jsdom and walks every route,
                                 # for all 8 demo roles; reports runtime errors and
                                 # empty screens. Screenshots land in testtools/shots
                                 # when a headless Chrome is available.
node testtools/flows.js          # end-to-end write flows (homework → grading →
                                 # notifications → clinic queue → pharmacy stock)
```

For a dependency-free check of the backend use `npm test` (see `src/selftest.js`) — it boots
the app on a random port and exits non-zero on failure.
