# checkbox

2026-08-09, golden pair via three-way merge. Clean merge; the project's resolved
lucide `CheckIcon` survived.

## Changed

- `packages/ui/src/components/checkbox.tsx` : import moves to
  `@base-ui/react/checkbox`, props type becomes `CheckboxPrimitive.Root.Props`
  (`checkbox.tsx:4`). Part names and every class string are unchanged; this is
  the cleanest 1:1 of the whole migration.

Leftover scan clean : `grep -n "radix-ui\|@radix" packages/ui/src/components/checkbox.tsx`
returns nothing.

## Left alone

`apps/desktop/src/renderer/src/components/converter/ModList.tsx:84` : uses
`checked` + a single-argument `onCheckedChange`, both of which pass through
unchanged (Base UI only appends an `eventDetails` argument).

## Behavior changes

- Base UI's checkbox Root renders a `<button>` and takes `indeterminate` as a
  separate boolean, where radix accepted `checked="indeterminate"`. Not used
  here.
- The base registry's class list keeps `disabled:*` variants that are now dead
  on a non-input element. Left as the registry ships it.

## Verify by hand

1. In the mod list, click a row checkbox : it toggles, and the check icon
   appears centred.
2. Click the row label / use Space on a focused checkbox : same result.
3. Select many rows quickly and confirm the list stays responsive (the
   `memo`'d row and the shared `toggleMod` handler are unchanged, but this is
   the screen where a re-render regression would show).
