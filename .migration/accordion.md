# accordion

2026-08-09, golden pair via three-way merge (`radix-mira` ancestor, `base-mira`
target). Clean merge, no customizations to replay.

## Changed

- `packages/ui/src/components/accordion.tsx` : import moves to
  `@base-ui/react/accordion`. `AccordionPrimitive.Content` -> `.Panel`
  (`accordion.tsx:56`), part prop types go from
  `React.ComponentProps<typeof X>` to `X.Props`. The trigger's
  `disabled:pointer-events-none disabled:opacity-50` becomes `aria-disabled:*`
  (`accordion.tsx:39`) : Base UI's accordion trigger surfaces disabled state as
  `aria-disabled`, so the old variants were dead. The height animation moves to
  `h-(--accordion-panel-height)` with `data-starting-style:h-0
  data-ending-style:h-0` on the Panel's inner div (`accordion.tsx:64`), which is
  where the radix height var already lived.
- `apps/desktop/src/renderer/src/components/converter/ProgressModal.tsx:83` :
  `<Accordion type="multiple">` -> `<Accordion multiple>`. Base UI drops the
  `type` prop; `value`/`defaultValue` are always arrays.

Leftover scan clean : `grep -n "radix-ui\|@radix" packages/ui/src/components/accordion.tsx`
returns nothing.

## Left alone

Nothing. The accordion had no other consumer in `apps/desktop`.

## Behavior changes

- `value` / `defaultValue` are now always arrays even for single-open
  accordions. Not exercised here (the only call site is uncontrolled), but a
  future controlled usage cannot pass a bare string.

## Verify by hand

1. Open a finished conversion, expand the created/overwritten sections in the
   progress modal : several panels must be able to stay open at once.
2. Collapse one and watch the height transition : it should animate, not snap
   (the animation moved from keyframes to starting/ending styles).
3. Tab to a trigger and press Enter/Space : it toggles, and the chevron flips.
