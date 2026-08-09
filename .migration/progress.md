# progress

2026-08-09, golden pair via three-way merge. Clean merge.

## Changed

- `packages/ui/src/components/progress.tsx` : import moves to
  `@base-ui/react/progress`. The primitive now computes the fill, so the manual
  `style={{ transform: translateX(-${100 - value}%) }}` is gone
  (`progress.tsx:34`). The file gains the Base UI parts as exported wrappers :
  `ProgressTrack`, `ProgressIndicator`, `ProgressLabel`, `ProgressValue`. The
  `Progress` wrapper still renders its own `Track > Indicator` internally, so
  existing `<Progress value={n} />` call sites keep working unchanged.

Leftover scan clean : `grep -n "radix-ui\|@radix" packages/ui/src/components/progress.tsx`
returns nothing.

## Left alone

Both consumers pass only `value` and needed no edit :
`apps/desktop/src/renderer/src/components/converter/ProgressModal.tsx:143` and
`apps/desktop/src/renderer/src/components/UpdateBanner.tsx:88`.

## Behavior changes

- The Root is now a flex container (`flex flex-wrap gap-3`) rather than the bar
  itself; the bar is the Track child. Visually equivalent for a bare
  `<Progress value>`, but a consumer that styled `[data-slot=progress]` as the
  bar would now be styling the wrapper.
- Fill is driven by the primitive from `value` / `max`, so a `value` outside
  0..100 clamps instead of producing an out-of-range translate.

## Verify by hand

1. Run a conversion and watch the modal bar : it must fill smoothly from 0 to
   100, not jump or start full.
2. Trigger an update download and watch the banner bar the same way.
3. Check the bar's height and rounding are unchanged (the track classes moved to
   a new element).
