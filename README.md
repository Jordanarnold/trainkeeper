# Trainkeeper

Phone-first Mexican Train score keeper with a camera pip counter. See PLAN.md
for the spec and decisions.

## Run

```bash
npm install
npm run dev      # http://localhost:5177
npm test         # vitest unit tests (rules, store)
npm run build    # type-check + production build to dist/
npm run lint
```

## Layout

- `src/lib/` game rules, storage, types (unit tested)
- `src/screens/` games list, new game, board, round sheet
- `src/components/PipCounter.tsx` camera modal
- `src/vision/pipCounter.ts` pure image analysis (no DOM)
- `test-images/` real photos of Jordan's set with expected pip totals in the file names
- `pip-counter.html` the original standalone prototype, kept for reference
