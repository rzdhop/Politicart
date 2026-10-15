# Vision

## Purpose

**Politicart / Kart Republique** is *Grand Prix de l'Hemicycle* -- a satirical 3D
kart racer that runs in the browser, starring a cast of fictional French
politicians. It is a self-contained piece of playable satire: three laps, five AI
opponents, eleven candidates, three circuits, no cohabitation.

All characters, parties and scandals are fictional by design. That is a product
constraint, not a disclaimer: the humour comes from archetypes, never from real
named figures.

## Business context

The project is a personal showcase piece, hosted on GitHub Pages at
`https://rzdhop.github.io/Politicart/`. Its value is in being *immediately
playable* and *visually distinctive* -- a visitor should be racing within seconds
of landing, and should recognise the look as deliberate rather than default.

The look is the asset. The game carries a single committed visual identity:
a dark "hemicycle night" palette (Marianne blue `#1f3a93`, republican red
`#c8102e`, parliament gold `#f2c14e`), display type in Lilita One over body text
in Nunito, glass panels over a live WebGL scene, and chunky arcade HUD readouts.

## The current work: a design system

That visual identity currently exists only as 130 lines of CSS inside a single
HTML file. The work in progress extracts it into a real component library
(`packages/ui`, React + TypeScript) and syncs it to Claude Design, so that
design agents building new screens for this project compose them from the
game's actual parts and palette instead of generic components.

How it serves the project:

- **Consistency.** New screens (leaderboards, a championship mode, a landing
  page) inherit the identity by construction rather than by copy-paste.
- **Leverage.** A design agent given the real components produces work that maps
  1:1 onto shippable code.
- **Durability.** The visual language becomes documented and typed, instead of
  living as class names one developer remembers.

The game itself remains the product. The library serves it, never the reverse.
