# popover

2026-08-09, golden pair via three-way merge. Clean merge.

## Changed

- `packages/ui/src/components/popover.tsx` : import moves to
  `@base-ui/react/popover`. `Content` becomes `Portal > Positioner > Popup`
  (`popover.tsx:26`); `align`, `alignOffset`, `side` and `sideOffset` are
  declared via `Pick<PopoverPrimitive.Positioner.Props, ...>`, destructured, and
  forwarded to the Positioner, which carries `isolate z-50`. The transform-origin
  var becomes `--transform-origin`, and logical-side variants
  (`data-[side=inline-start|inline-end]`) join the physical ones. `PopoverTitle`
  and `PopoverDescription` are real primitive parts now instead of a plain
  `<div>` / `<p>` (`popover.tsx:58`, `popover.tsx:71`), which is what gives the
  popup its `aria-labelledby` / `aria-describedby`.
- `PopoverAnchor` is removed, including from the export list : Base UI has no
  Anchor part.

Leftover scan clean : `grep -n "radix-ui\|@radix" packages/ui/src/components/popover.tsx`
returns nothing.

## Left alone

`popover` has no consumer in `apps/desktop`, and nothing imported `PopoverAnchor`
(checked across `apps` and `packages` before removing it).

## Behavior changes

- No anchor : a popover can no longer be positioned against an element other
  than its trigger. Nothing needed that here.
- `openDelay` / `closeDelay` move from Root to Trigger in Base UI. Unused.

## Verify by hand

Once a popover exists in the app : open it near a screen edge and confirm it
flips side instead of overflowing, check the arrow/origin animation reads
correctly on each side, then press Escape and confirm it closes and returns
focus.
