# alert-dialog

2026-08-09, golden pair via three-way merge. Clean merge; the project's
`font-heading` title class survived.

## Changed

- `packages/ui/src/components/alert-dialog.tsx` : import moves to
  `@base-ui/react/alert-dialog`. `Overlay` -> `Backdrop`
  (`alert-dialog.tsx:28`), `Content` -> `Popup` (`alert-dialog.tsx:49`, a
  centered modal so it takes no Positioner), `Cancel` -> `Close` rendering a
  Button (`alert-dialog.tsx:163`). `AlertDialogAction` is now a plain `Button`
  (`alert-dialog.tsx:142`) : Base UI has no Action part. The Backdrop gains
  `isolate` from the base golden. The project's `font-heading` (instead of the
  registry's `cn-font-heading`) is kept at `alert-dialog.tsx:118`.

Leftover scan clean : `grep -n "radix-ui\|@radix" packages/ui/src/components/alert-dialog.tsx`
returns nothing.

## Left alone

Nothing related. `alert-dialog` has no consumer in `apps/desktop` yet, so there
was no call-site sweep to do beyond the wrapper itself.

## Behavior changes

- `AlertDialogAction` no longer closes the dialog on click. Radix's
  `AlertDialog.Action` closed it implicitly; the replacement is an ordinary
  button, so the first consumer must close the dialog itself (controlled `open`,
  or wrap the action in `AlertDialogClose`). Flagged, not patched.
- `onOpenAutoFocus` / `onCloseAutoFocus` no longer exist; Base UI uses
  `initialFocus` / `finalFocus` (element or ref, not an event to cancel).
  Nothing used them here.

## Verify by hand

1. Open an alert dialog, press Escape : it closes and focus returns to the
   trigger.
2. Click the backdrop : an alert dialog should NOT close on outside press.
3. Click Cancel : closes. Click Action : confirm it does what you expect, and
   remember it will not close on its own.
