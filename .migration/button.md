# button

2026-08-09, golden pair via three-way merge. Clean merge; the project's
`hover:bg-secondary/80` override survived.

## Changed

- `packages/ui/src/components/button.tsx` : now wraps the real
  `@base-ui/react/button` primitive (`button.tsx:1`), not a hand-rolled
  `useRender` shim. `asChild` is gone in favour of `render`, and the props type
  is `ButtonPrimitive.Props & VariantProps<typeof buttonVariants>`
  (`button.tsx:45`). Per the base golden the wrapper stops emitting
  `data-variant` / `data-size`; nothing in `globals.css` or the app reads those
  attributes (checked). The project's secondary-variant hover colour is kept at
  `button.tsx:15`.
- `packages/ui/src/components/pagination.tsx` : taken from the `base-mira`
  golden (the file was byte-identical to the `radix-mira` golden, so there was
  nothing to replay). `PaginationLink` becomes `<Button nativeButton={false}
  render={<a .../>} />` (`pagination.tsx:48`) instead of `<Button asChild><a/></Button>`.
- `packages/ui/src/components/alert-dialog.tsx` : the two `<Button asChild>`
  call sites moved to `render` in this commit so the tree stayed buildable; the
  file's own primitives were migrated separately (see `alert-dialog.md`).

Leftover scan clean : `grep -n "radix-ui\|@radix"` over `button.tsx` and
`pagination.tsx` returns nothing.

## Left alone

The 8 `<Button>` call sites in `apps/desktop` needed no change : none used
`asChild`, and `variant` / `size` / `disabled` / `onClick` all pass through.

## Behavior changes

- `data-variant` and `data-size` are no longer rendered on buttons. Nothing
  selects on them today, but a future CSS or test selector that expects them
  would break.
- Base UI's Button applies its own `disabled` handling (it keeps the element
  focusable when `nativeButton={false}`). Visually identical here.

## Verify by hand

1. Click through the main screen : Run, Cancel, the header buttons. Hover and
   active states, and the `active:translate-y-px` nudge, must be unchanged.
2. Tab through them : focus rings must still show.
3. Disable a button (start a conversion, the Run button disables) : it must look
   dimmed and refuse clicks.
