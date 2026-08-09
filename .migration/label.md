# label

2026-08-09, golden pair via three-way merge. Clean merge.

## Changed

- `packages/ui/src/components/label.tsx` : Base UI has no Label primitive, so
  the wrapper renders a native `<label>` (`label.tsx:8`) typed as
  `React.ComponentProps<"label">`. The class string, including the
  `peer-disabled:*` and `group-data-[disabled=true]:*` variants, is unchanged.

Leftover scan clean : `grep -n "radix-ui\|@radix" packages/ui/src/components/label.tsx`
returns nothing.

## Left alone

The 4 `<Label htmlFor=...>` call sites in `apps/desktop` are unchanged : a
native label takes the same props radix's did.

## Behavior changes

None expected. Radix's Label primitive was itself a `<label>` plus a
double-click text-selection guard, which Base UI drops.

## Verify by hand

1. On the settings screen, click a field label : focus must move to its control
   (this is the `htmlFor` wiring, the one thing that would break).
2. Click a switch's label : the switch must toggle.
3. Double-click a label : text may now select where radix suppressed it. Cosmetic.
