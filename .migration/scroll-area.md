# scroll-area

2026-08-09, golden pair via three-way merge. Clean merge.

## Changed

- `packages/ui/src/components/scroll-area.tsx` : import moves to
  `@base-ui/react/scroll-area`. `ScrollAreaScrollbar` -> `Scrollbar` and
  `ScrollAreaThumb` -> `Thumb` (`scroll-area.tsx:35`, `scroll-area.tsx:45`),
  props types become `ScrollAreaPrimitive.X.Props`. Viewport, Corner and every
  class string are unchanged.

Leftover scan clean : `grep -n "radix-ui\|@radix" packages/ui/src/components/scroll-area.tsx`
returns nothing.

## Left alone

`apps/desktop/src/renderer/src/components/converter/ModList.tsx:55` uses only
`className`, so no call site changed.

## Behavior changes

- The radix `type` prop (`always` / `scroll` / `hover` / `auto`) has no Base UI
  equivalent and is gone. It was not used, so the scrollbar visibility policy is
  now whatever Base UI defaults to rather than an explicit choice.

## Verify by hand

1. Open the mod list with enough mods to overflow the 16rem box : the custom
   scrollbar must appear on the right.
2. Drag the thumb, then use the wheel : both must scroll the list.
3. Confirm the scrollbar does not overlap or clip the last row.
