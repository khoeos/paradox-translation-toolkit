# select

2026-08-09, golden pair. The `base-mira` golden was taken as the target minus
the `cn-menu-*` hooks, reproducing the project's only customization (the rest of
its diff was formatting).

## Changed

- `packages/ui/src/components/select.tsx` : import moves to
  `@base-ui/react/select`. `Select` is now a bare re-export of
  `SelectPrimitive.Root` (`select.tsx:6`) because `Root.Props` is generic over
  the value type and a wrapper function would swallow the inference. `Content`
  becomes `Portal > Positioner > Popup` (`select.tsx:73`), `Viewport` -> `List`,
  `Label` -> `GroupLabel`, `ScrollUp/DownButton` -> `ScrollUp/DownArrow`, and
  the item anatomy puts `ItemText` first with `ItemIndicator` rendering the
  absolute-positioned span. The radix `position` prop is replaced by
  `alignItemWithTrigger` (default `true`), and the CSS vars become
  `--available-height` / `--anchor-width` / `--transform-origin`.
- `apps/desktop/src/renderer/src/components/Header.tsx:43` :
  `position="popper"` -> `alignItemWithTrigger={false}`.
- `apps/desktop/src/renderer/src/components/converter/SourceLanguage.tsx:28` :
  `onValueChange` now yields `LanguageCode | null`, which made the existing
  `value as LanguageCode` assertion unsound rather than merely redundant. It is
  a `value !== null` guard now, and the then-unused `LanguageCode` type import
  was removed. This also satisfies the repo's no-`as` rule.

Leftover scan clean : `grep -n "radix-ui\|@radix\|cn-menu" packages/ui/src/components/select.tsx`
returns nothing.

## Left alone

The generic `Select` re-export means `value` drives inference; both call sites
pass a typed value, so `onValueChange` is correctly narrowed rather than
`unknown`. Verified by removing the assertion and reading the compiler error.

## Behavior changes

- `alignItemWithTrigger` defaults to `true`, i.e. the old `item-aligned`
  behaviour. The header's language select opted into `popper`, so it keeps the
  non-aligned placement explicitly.
- `onValueChange` can now deliver `null` (cleared selection). Neither select is
  clearable today, so the guard is defensive.

## Verify by hand

1. Header : open the UI language select. It must drop below the trigger (not
   over it), match the trigger's width, and switching language must re-render
   the app in that language.
2. Main screen : open the source language select. The current value must be
   pre-highlighted and aligned over the trigger, and picking a language must
   update the target-language list below.
3. In both : type a letter for typeahead, arrow through, press Enter, then
   reopen and press Escape. Focus must return to the trigger.
4. With many languages, confirm the scroll arrows appear at the top/bottom edges
   and work.
