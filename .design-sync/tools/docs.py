#!/usr/bin/env python3
"""Writes README.md, <Comp>.d.ts and preview.html for the re-synced select
components, and the regenerated components/index.d.ts, in the layout the
Design System artifact already publishes.

usage: docs.py <published project dir> <tree root> <stage project dir> <heights.json>
"""
import json, os, re, sys

PUB, TREE, STAGE, HEIGHTS = sys.argv[1:5]
SRC = os.path.join(TREE, 'packages/ui/src/components')
heights = json.load(open(HEIGHTS)) if os.path.exists(HEIGHTS) else {}

REF = ('/** Allows getting a ref to the component instance. Once the component unmounts, '
       'React will set `ref.current` to `null` (or  */')


def doc(text):
    """One prop line's JSDoc, as the converter writes it: one line, first 120 chars."""
    if text.startswith('/**'):  # a line kept verbatim from the published card
        return text
    return '/** ' + re.sub(r'\s+', ' ', text).strip() + ' */'


ROOT_DESC_STAGE = ("What the band shows and what it does, for assistive technology -- the game writes "
                   "« Le podium : glissez pour le faire pivoter ». Describe the scene, not the candidate: "
                   "their name is already the showcase's heading.")

# Props per component, in the order the published cards use: own props first.
PROPS = {
    'ShowcaseStage': [
        ('"aria-label": string;', ROOT_DESC_STAGE),
        ('ref?: React.Ref;', None), ('className?: string;', ''), ('id?: string;', ''),
        ('style?: CSSProperties;', ''), ('children?: React.ReactNode;', ''),
    ],
    'Showcase': [
        ('name: React.ReactNode;', "The character's name, set large in the display face."),
        ('title?: React.ReactNode;', 'Their epithet -- "Le jeune président" -- in gold small caps.'),
        ('quote?: React.ReactNode;', 'Their catchphrase, rendered in muted italics.'),
        ('stage?: React.ReactNode;', "The band the 3D scene draws into, rendered first, above the name: pass a `ShowcaseStage`. It takes the showcase's free height, so the name, the stats and the power box keep their place at the bottom and the model gets everything above them. Omit it and the showcase is text only, bottom-aligned over whatever the canvas behind it shows."),
        ('style?: CSSProperties;', ''), ('children?: React.ReactNode;', ''),
        ('ref?: React.Ref;', None), ('className?: string;', ''), ('id?: string;', ''),
    ],
    'CharacterTile': [
        ('name: string;', "The character's name. Shown on the strip and used as the image's alt text."),
        ('image?: string;', "/** Portrait to fill the tile, as any image URL -- the game passes a data URL it renders off-screen from the character's 3D  */"),
        ('selected?: boolean;', 'Marks this tile as the current choice: gold border, ring and a slight scale-up.'),
        ('badge?: React.ReactNode;', "/** Something small pinned to the tile's top-right corner, over the portrait: a `GradeBadge`, a price. The game's lock pill sits top-centre. */"),
        ('pending?: boolean;', 'The portrait is still being rendered: a light sweeps across the tile and the button reports `aria-busy`. Pass it while `image` is a placeholder and drop it when the final image lands. The tile stays fully usable while pending. The sweep is CSS only, off under `prefers-reduced-motion`.'),
        ('style?: CSSProperties;', ''),
        ('ref?: React.Ref;', None), ('className?: string;', ''), ('id?: string;', ''),
    ],
    'Roster': [
        ('footer?: React.ReactNode;', 'What sits under the tiles, across the full width of the grid: on wide screens, the button row and its keyboard legend. Rendered in a `.roster-foot` block that left-aligns a `Row`, sets loose text in the muted 13px of a legend line and spaces its lines 10px apart. Omit it (or pass `null`/`false`) and nothing is rendered.'),
        ('ref?: React.Ref;', None), ('className?: string;', ''), ('id?: string;', ''),
        ('style?: CSSProperties;', ''), ('children?: React.ReactNode;', ''),
    ],
    'SelectLayout': [
        ('ref?: React.Ref;', None), ('className?: string;', ''), ('id?: string;', ''),
        ('style?: CSSProperties;', ''), ('children?: React.ReactNode;', ''),
    ],
}


def section(comp):
    lines = ['/**', f' * {comp} — from @politikart/ui@0.1.0 (./src/components/select/{comp}.stories.tsx).', ' */',
             f'export interface {comp}Props {{']
    for decl, d in PROPS[comp]:
        if d is None:
            lines.append('  ' + REF)
        elif d:
            lines.append('  ' + doc(d))
        lines.append('  ' + decl)
    lines += ['}', '', f'export declare const {comp}: React.ComponentType<{comp}Props>;']
    return '\n'.join(lines)


def story_meta(comp):
    src = open(os.path.join(SRC, 'select', f'{comp}.stories.tsx'), encoding='utf8').read()
    m = re.search(r"component:\s*'((?:[^'\\]|\\.)*)'", src)
    desc = m.group(1).replace("\\'", "'")
    keys = re.findall(r'^export const ([A-Z]\w*)', src, re.M)
    body = src[src.index('type Story = StoryObj<typeof meta>;') + len('type Story = StoryObj<typeof meta>;'):].strip()
    return desc, keys, body


def spaced(k):
    return re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', k)


def readme(comp):
    desc, keys, body = story_meta(comp)
    props = section(comp).split('export interface ', 1)[1].split('\n\nexport declare')[0]
    out = [desc, '',
           f'{comp} from @politikart/ui. Use via `window.PolitikartUI.{comp}` (the bundle at `components/bundle.js`). '
           'Wrap the tree in `<PreviewRoot>` (full provider chain in README.md — components read theme/i18n from that context).', '',
           'Variants (see `preview.html`): ' + ', '.join(spaced(k) for k in keys) + '.', '',
           '## Props', '', '```ts', 'interface ' + props, '```', '',
           '## Examples', '', '```jsx', body, '```', '']
    for k in keys:
        out += [f'### {k}', '', '```jsx', f'/* {spaced(k)} */ compose(S, "{k}")', '```', '']
    return '\n'.join(out)


PREVIEW_STYLE = open(os.path.join(PUB, 'components/Showcase/preview.html'), encoding='utf8').read().split('\n')[3]
assert PREVIEW_STYLE.startswith('<style>'), PREVIEW_STYLE


def preview(comp):
    h = heights.get(comp, 600)
    return (f'<!-- @dsCard group="select" height={h} -->\n<!doctype html>\n'
            f'<html lang="fr"><head><meta charset="utf-8"><title>{comp}</title>\n{PREVIEW_STYLE}\n'
            '</head><body><div class="ds-grid" id="g"></div><script src="./stories.js"></script></body></html>\n')


def write(rel, text):
    p = os.path.join(STAGE, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf8', newline='\n').write(text)


for comp in PROPS:
    write(f'components/{comp}/{comp}.d.ts', "import * as React from 'react';\n\n" + section(comp) + '\n')
    write(f'components/{comp}/README.md', readme(comp))
    write(f'components/{comp}/preview.html', preview(comp))

# index.d.ts: the published one, with the select sections regenerated,
# ShowcaseStage inserted after Showcase, and the package named @politikart/ui.
idx = open(os.path.join(PUB, 'components/index.d.ts'), encoding='utf8').read()
parts = re.split(r'(?=^/\*\*\n \* \w+ — from )', idx, flags=re.M)
head, secs = parts[0], parts[1:]
name_of = lambda s: re.match(r'/\*\*\n \* (\w+) — from', s).group(1)
out = []
for s in secs:
    n = name_of(s)
    tail = ''
    if n in PROPS:
        # keep whatever trails the section (the PreviewRoot block after the last one)
        body_end = s.index(f'export declare const {n}: React.ComponentType<{n}Props>;') + len(f'export declare const {n}: React.ComponentType<{n}Props>;')
        tail = s[body_end:]
        s = section(n) + tail
    out.append(s)
    if n == 'Showcase':
        out.append(section('ShowcaseStage') + '\n\n')
idx2 = head + ''.join(out)
idx2 = idx2.replace('@kart-republique/ui@0.1.0', '@politikart/ui@0.1.0')
write('components/index.d.ts', idx2)
print('sections', len(secs) + 1)
