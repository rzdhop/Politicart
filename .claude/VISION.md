# Vision

## Purpose

**Politicart / Politikar** is *Grand Prix de l'Hemicycle* -- a satirical 3D
kart racer that runs in the browser, starring French politicians under pun
names (Emmanuel Macaron, Marine Le Stylo, Jean-Luc Mélèche...). It is a
self-contained piece of playable satire: three laps, five AI opponents,
sixteen candidates, three circuits, no cohabitation.

The cast parodies real figures, one pun away from their names (DEC-023). That
replaced the earlier "fictional, never real figures" constraint at the human's
request. Powers, lines and scandals stay invented, and the title screen says
so: the parody notice is part of the product.

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

## Team races

Friends can now race each other: Bleu against Rouge, two to six players, AI
filling the grid, points per finishing place. One small Node server serves
the game and runs every race on the game's own engine (DEC-014), on a LAN
today and in a container on a host later. The published GitHub Pages game
stays the instant single-player experience the showcase is built around.

## The cast, the admin and the Garage

One admin account ("rida") owns the cast on the game server: names, colours,
liveries, posters and each candidate's default kart. Every player sees it,
on the server's page and on the Pages build (DEC-026, DEC-027). Every player
owns their own kart in the Garage -- colours, wheels, spoiler, number,
sticker. It is kept in their browser and shown to the others in team races.


## The economy: politicoins, the Boutique and the Politibox

Every race pays politicoins; the Boutique sells the candidates (once their
level is reached) and the kart parts, each with a grade -- common, rare,
mythic, incredible -- that sets its price and its badge. The Politibox, a
gold ballot urn opened in a 3D sequence, hands out politicoins, parts, the
trails nobody can buy, and now and then a candidate whatever the level
(DEC-032..037). The server owns every balance, inventory and roll, and
never shows another player a part its owner did not earn (DEC-035). Five
circuits now, with Montmartre and Marseille beside the three Paris ones,
and each account keeps its stats, visible to its friends.
