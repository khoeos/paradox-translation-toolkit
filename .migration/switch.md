# switch

2026-08-09, golden pair via three-way merge. Clean merge.

## Changed

- `packages/ui/src/components/switch.tsx` : import moves to
  `@base-ui/react/switch`, props type becomes `SwitchPrimitive.Root.Props &
  { size?: "sm" | "default" }` (`switch.tsx:9`). Parts, the `size` variant and
  every class string are unchanged; this is a 1:1 primitive.

Leftover scan clean : `grep -n "radix-ui\|@radix" packages/ui/src/components/switch.tsx`
returns nothing.

## Left alone

All 4 consumers pass `checked` plus a single-argument `onCheckedChange`, which
still type-checks (Base UI only appends an `eventDetails` argument) :
`converter/TargetLanguages.tsx:32`, `converter/TranslateSettings.tsx:63`,
`routes/index.tsx:84`, `routes/settings.lazy.tsx:239` and `:251`.

## Behavior changes

None observed. As with checkbox, the Root is not a native input, so any
`disabled:*` Tailwind variant on it would be dead; the current classes use
`data-*` and `aria-*` hooks.

## Verify by hand

1. Settings screen : toggle "auto check updates" and the beta channel switch,
   reload the app, and confirm both persisted (the handler signature is the
   thing that could silently change).
2. Main screen : toggle overwrite, and toggle a target language on/off.
3. Confirm the source language's switch is still disabled and cannot be toggled.
