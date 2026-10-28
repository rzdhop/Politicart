# Building with @politikar/ui

This is the look of *Politikar*, a satirical browser kart racer: a dark
"hemicycle night" palette, display type in Lilita One over body text in Nunito,
glass panels over a live scene, and chunky arcade HUD readouts. It is **dark-only**:
there is no light theme and every component assumes the dark background.

## Setup: the background is part of the system

The stylesheet (`styles.css`) paints `body` with `var(--bg)`, sets the body font
and `overflow: hidden`, and embeds both web fonts, so a full page that loads it
needs nothing else. A **fragment rendered on a page that does not carry the
system's `body` rule** must be wrapped in `PreviewRoot`, which supplies the
background, foreground colour and body font:

```jsx
<PreviewRoot>
  <Panel>…</Panel>
</PreviewRoot>
```

Without it, ghost buttons, cream text and glass panels render invisible on a white
page. There is no other provider, theme or context: no `ThemeProvider`, no CSS-in-JS.

## Styling idiom: real class names and real tokens

Components carry fixed class names from the stylesheet; styling is done by
composing components, not by inventing classes. For your own layout glue use the
**tokens**, as `var(--name)`:

| Token | Value / role |
|---|---|
| `--bg` | `#0c1230`, the page and canvas background |
| `--panel`, `--panel-2` | translucent panel fills (glass over the scene) |
| `--fg`, `--muted` | cream text and its muted companion |
| `--blue`, `--red`, `--gold` | Marianne blue `#1f3a93`, republican red `#c8102e`, parliament gold `#f2c14e` |
| `--line` | hairline borders at 18 % cream |
| `--font-display`, `--font-body`, `--font-mono` | Lilita One, Nunito, monospace |

The class vocabulary the components render, for reading the stylesheet rather
than for writing markup by hand: `.screen`, `.panel`, `.row`, `.btn` / `.btn.ghost`,
`.controls`, `.tricolore`, `.sub`, `.disclaimer`, `.select-layout`, `.roster`,
`.tile` / `.tile.sel`, `.showcase`, `.stats`, `.stat`, `.bar`, `.powerbox`, `.cards`,
`.card` / `.card.sel`, `.hud`, `.hud-tl` / `.hud-tr` / `.hud-bl` / `.hud-br`, `.pos`,
`.lap`, `.timer`, `.minimap`, `.item` / `.item.has`, `.power` / `.power.ready`, `.hint`,
`.speed`, `.drift`, `.center`, `.toast` / `.toast.on`, `.wrong`, `.results-table`,
`.admin`, `.colors`, `.livery`, `.ad-preview`, `.note`. Do not add classes of your own
to these elements; pass `className` only to attach your layout, and `style` for
one-off positioning.

Every component spreads the native element's props (`id`, `style`, `aria-*`,
event handlers), so a `Button` is a real `<button>`, a `CharacterTile` and a
`TrackCard` are `<button>`s with `aria-pressed`, a `Field` is a `<label>`.

## HUD readouts: props for designs, handles for game loops

Every live readout (`PositionReadout`, `SpeedReadout`, `DriftGauge`, `ItemSlot`,
`PowerGauge`, `LapCounter`, `RaceTimer`, `CenterAnnounce`, `Toast`, `WrongWay`,
`HudHint`) takes ordinary props for a static design *and* exposes an imperative
`ref` handle (`setValue`, `setText`, `setPosition`, `setItem`, `setCharge`,
`setReady`, `setKeyHint`, `show`/`hide`, `setVisible`) for code that updates it
sixty times a second. In a design, use the props. Lay a HUD out as
`HudLayer` > four `HudCorner`s (`corner="topLeft"` …) > readouts.

## Where the truth lives

Read `styles.css` (the tokens are at the top, in `:root`) and each component's
`.d.ts` and `.prompt.md` before styling. All copy is French and passed as props
or children: the library bakes in no wording.

## One idiomatic screen

```jsx
<PreviewRoot>
  <Screen>
    <Tricolore />
    <GameTitle>POLITIKAR</GameTitle>
    <Subtitle>Grand Prix de l’Hémicycle</Subtitle>
    <Panel style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
      <Row>
        <Button>Jouer</Button>
        <Button variant="ghost">Atelier (admin)</Button>
      </Row>
      <ControlsGrid>
        <div><KeyCap>↑</KeyCap> / <KeyCap>Z</KeyCap> accélérer</div>
        <div><KeyCap>Espace</KeyCap> dérapage</div>
      </ControlsGrid>
      <Disclaimer>Personnages, partis et scandales sont fictifs.</Disclaimer>
    </Panel>
  </Screen>
</PreviewRoot>
```
