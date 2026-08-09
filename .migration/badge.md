# badge

2026-08-09, golden pair via three-way merge. Clean merge.

## Changed

- `packages/ui/src/components/badge.tsx` : the radix `Slot` / `asChild` idiom is
  replaced by `useRender` + `mergeProps` from `@base-ui/react/use-render` and
  `@base-ui/react/merge-props` (`badge.tsx:32`). The public prop is `render`
  instead of `asChild`, and `data-slot` / `data-variant` are emitted through
  `state: { slot: "badge", variant }` rather than as literal JSX attributes.
  `badgeVariants` and every class string are untouched.

Leftover scan clean : `grep -n "radix-ui\|@radix" packages/ui/src/components/badge.tsx`
returns nothing.

## Left alone

Nothing. The single consumer (`apps/desktop`) uses `<Badge variant=...>` with no
`asChild`, so no call site changed.

## Behavior changes

None. `useRender` is the documented Base UI equivalent of the Slot idiom for
non-button polymorphic components.

## Verify by hand

1. Look at any screen showing a badge : size, radius and colour must be
   unchanged, and the variant colour must still apply (the variant now arrives
   as a `state` entry, which is the easy thing to get wrong).
2. Inspect a badge in devtools : it should still carry `data-slot="badge"` and
   `data-variant`.
