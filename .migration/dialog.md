# dialog

2026-08-09, transformation engine applied to the project's own file. The wrapper
is heavily customized (65 lines away from the `radix-mira` golden), so
retargeting onto the `base-mira` golden would have thrown those customizations
away; only the radix -> Base UI mechanics were applied.

## Changed

- `packages/ui/src/components/dialog.tsx` : import moves to
  `@base-ui/react/dialog`. `Overlay` -> `Backdrop` (`dialog.tsx:31`), `Content`
  -> `Popup` (`dialog.tsx:53` and `dialog.tsx:71`), and every part prop type
  goes from `React.ComponentProps<typeof DialogPrimitive.X>` to
  `DialogPrimitive.X.Props`. A centered modal takes no Positioner, so the
  fixed/translate positioning classes stay on the Popup. Kept verbatim : the
  `size` (`default | sm | lg | xl`) and `closable` props, the bare
  `DialogPrimitive.Close` close button with its own classes (the golden uses a
  ghost `Button` instead), the `gap-1.5 text-left` header, the simplified
  footer, and the `font-heading` title.
- `apps/desktop/src/renderer/src/components/converter/ProgressModal.tsx:132` :
  `onPointerDownOutside` and `onEscapeKeyDown` have no Base UI equivalent. The
  refusal to dismiss while a job runs is now expressed on the Root's
  `onOpenChange(open, eventDetails)` : when `eventDetails.reason` is
  `'outside-press'` or `'escape-key'` and the job is running, the change is
  refused with `eventDetails.cancel()`. Verified against
  `node_modules/@base-ui/react/dialog/root/DialogRoot.d.ts` and
  `internals/reason-parts.d.ts` rather than guessed.

Leftover scan clean : `grep -n "radix-ui\|@radix\|DialogPrimitive.Content\|DialogPrimitive.Overlay"
packages/ui/src/components/dialog.tsx` returns nothing.

## Left alone

The dialog wrapper was NOT retargeted onto the `base-mira` golden. Doing so
would have replaced the project's close button, size variants and footer with
the registry's, which is a redesign, not a migration.

## Behavior changes

- Dismissal is now decided in one place (the Root's `onOpenChange`) instead of
  two per-interaction callbacks on the content. The observable behaviour is
  meant to be identical, but the code path is different enough to deserve the
  manual check below.
- `onOpenAutoFocus` / `onCloseAutoFocus` are gone in Base UI (replaced by
  `initialFocus` / `finalFocus`). Nothing used them.

## Verify by hand

1. Start a conversion. While it runs : press Escape (modal must stay open),
   click outside the modal (must stay open), and confirm the close button in
   the corner is absent.
2. Let it finish. Now Escape closes it, an outside click closes it, and the
   corner close button is back.
3. After closing, focus must return to the control that opened the modal.
4. Check the modal is still centred and capped at `max-w-4xl`.
