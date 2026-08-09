# dropdown-menu

2026-08-09, golden pair. The `base-mira` golden was taken as the target (the
project's only deviations from the `radix-mira` golden were removed `cn-*`
hooks, which were re-stripped), because the registry reorders functions between
the two variants and a three-way merge left stale radix hunks behind.

## Changed

- `packages/ui/src/components/dropdown-menu.tsx` : `DropdownMenu` maps to
  `@base-ui/react/menu` (`MenuPrimitive`), the canonical rename. `Content`
  becomes `Portal > Positioner > Popup` with `align` / `alignOffset` / `side` /
  `sideOffset` declared, destructured and forwarded to the Positioner
  (`dropdown-menu.tsx:31`), `Label` -> `GroupLabel` (`dropdown-menu.tsx:64`),
  `ItemIndicator` splits into `CheckboxItemIndicator` and `RadioItemIndicator`,
  `Sub` / `SubTrigger` -> `SubmenuRoot` / `SubmenuTrigger` with the new
  `data-popup-open` open marker. `SubContent` keeps the golden's load-bearing
  `align="start" alignOffset={-3} side="right" sideOffset={0}`. CSS vars become
  `--available-height` / `--anchor-width` / `--transform-origin`.
- The `cn-menu-target`, `cn-menu-translucent` and `cn-rtl-flip` hooks the
  registry ships are stripped, matching what the project already did : none of
  them is defined in `packages/ui/src/styles/globals.css`.

Leftover scan clean : `grep -n "radix-ui\|@radix\|cn-menu\|cn-rtl"
packages/ui/src/components/dropdown-menu.tsx` returns nothing.

## Left alone

`dropdown-menu` has no consumer in `apps/desktop` yet, so there was no call-site
sweep. `packages/ui/src/components/sonner.tsx` keeps its `cn-toast` class : it
is a sonner wrapper, not radix, and out of scope.

## Behavior changes

- `closeOnClick` defaults to FALSE on `DropdownMenuCheckboxItem` and
  `DropdownMenuRadioItem` in Base UI. Radix closed the menu on select. Flagged,
  not patched : add `closeOnClick` explicitly if the first consumer wants the
  radix feel.
- `cn-rtl-flip` is dropped from the submenu chevron here but is still present in
  `pagination.tsx` (it came in with the base golden). The class is undefined
  either way, so this is dead-code inconsistency, not a visual difference.

## Verify by hand

Once a menu exists in the app : open it, arrow up/down through items, type a
letter for typeahead, hover a submenu trigger and confirm the submenu opens to
the right and aligns with its parent, then press Escape and confirm focus
returns to the trigger.
