# Category circle photos

`scripts/migrate-category-circles.ts` reads this folder and writes
`settings.category_circle_images` (keyed by collection slug), which feeds the homepage's
`CategoryCircles` strip.

| File | Circle | Collection slug |
|---|---|---|
| `BlueTea.png` | Blue Tea | `blue-tea` |
| `RedTea.png` | Red Tea | `red-tea` |
| `TeaCombo.png` | Tea Combos | `tea-combos` |
| `Spices.png` | Spices | `spices` |
| `SpiceCombo.png` | Spice Combos | `combos` |
| `BlackTea.png` | Black Tea | `classic-teas` |

To replace a photo, overwrite the file (keep the name) and run:

```bash
pnpm migrate-category-circles
```

Square sources crop best — the circles render at 96–128px with `object-cover`. Until a photo is
migrated, `app/page.tsx` falls back to the collection's lead product photo.
