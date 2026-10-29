#!/usr/bin/env python3
"""Writes the card files of any component -- README.md, <Comp>.d.ts and
preview.html -- read from its source and its stories, and rebuilds
components/index.d.ts in the bundle's export order, in the layout the Design
System artifact already publishes. The general form of docs.py, which keeps a
hand-written prop table for the five select parts only.

usage: cards.py <published project dir> <tree root> <stage project dir> <heights.json> <bundle.js> Comp...

- Props come from the component's `<Comp>Props` interface (or type alias):
  its own members first, each JSDoc folded to one line, then what it inherits
  from the native element (ref, className, id, style, children unless omitted).
  An `extends Omit<OtherProps, ...>` of another library component's props
  (TeamPicker's ChoiceGroupProps) lists that interface's members too.
- The other types the source file exports (handles, row shapes, unions) are
  written before the props, as the published KartCard and RevealStage cards do.
- index.d.ts keeps every published section and replaces or adds the listed
  components'; the order is the bundle header's (index.ts's export order). A
  component with no story of its own (KindGlyph) gets an index section from
  its source and no card.
"""
import json, os, re, sys

PUB, TREE, STAGE, HEIGHTS, BUNDLE = sys.argv[1:6]
COMPS = sys.argv[6:]
SRC = os.path.join(TREE, 'packages/ui/src/components')
heights = json.load(open(HEIGHTS)) if os.path.exists(HEIGHTS) else {}

REF = ('/** Allows getting a ref to the component instance. Once the component unmounts, '
       'React will set `ref.current` to `null` (or  */')


def find(comp):
    """(group, source path, stories path or None) of a component; KindGlyph lives in RevealCard.tsx."""
    for g in sorted(os.listdir(SRC)):
        d = os.path.join(SRC, g)
        f = os.path.join(d, comp + '.tsx')
        if os.path.exists(f):
            s = os.path.join(d, comp + '.stories.tsx')
            return g, f, s if os.path.exists(s) else None
    for g in sorted(os.listdir(SRC)):
        d = os.path.join(SRC, g)
        for n in sorted(os.listdir(d)):
            if n.endswith('.tsx') and '.stories.' not in n and '.test.' not in n:
                p = os.path.join(d, n)
                if re.search(r'^export function ' + comp + r'\b', open(p, encoding='utf8').read(), re.M):
                    return g, p, None
    raise SystemExit('no source for ' + comp)


def fold(doc):
    """A JSDoc block as one line of text."""
    body = re.sub(r'^/\*\*|\*/$', '', doc.strip())
    lines = [re.sub(r'^\s*\* ?', '', l) for l in body.split('\n')]
    return re.sub(r'\s+', ' ', ' '.join(lines)).strip()


def tstype(t):
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'(?<![\w.])(ReactNode|ReactElement|ComponentPropsWithRef|ComponentPropsWithoutRef|Key)\b', r'React.\1', t)
    return t


def block(src, start):
    """The text between the `{` at or after `start` and its matching `}`."""
    i = src.index('{', start)
    depth = 0
    for j in range(i, len(src)):
        c = src[j]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return src[i + 1:j], j + 1
    raise ValueError('unbalanced')


def members(body):
    """[(doc or None, 'name?: type;')] of an interface body, split at depth-0 `;`."""
    out, doc, buf, depth, i = [], None, '', 0, 0
    while i < len(body):
        if body.startswith('/**', i) and depth == 0 and not buf.strip():
            j = body.index('*/', i) + 2
            doc = fold(body[i:j])
            i = j
            continue
        if body.startswith('//', i) and depth == 0:
            i = body.index('\n', i) if '\n' in body[i:] else len(body)
            continue
        c = body[i]
        if c in '{(<[':
            depth += 1
        elif c in '})>]' and not (c == '>' and body[i - 1] == '='):
            depth -= 1
        if c == ';' and depth == 0:
            decl = re.sub(r'\s+', ' ', buf).strip()
            if decl:
                out.append((doc, decl))
            doc, buf = None, ''
        else:
            buf += c
        i += 1
    if buf.strip():
        out.append((doc, re.sub(r'\s+', ' ', buf).strip()))
    return out


def decl_name(decl):
    m = re.match(r'(readonly\s+)?(\w+|"[^"]+")(\??)\s*[:(]', decl)
    return m.group(2) if m else decl


def norm_decl(decl):
    name, rest = re.match(r'((?:readonly\s+)?(?:\w+|"[^"]+")\??)\s*(.*)$', decl).groups()
    if rest.startswith(':'):
        return name + ': ' + tstype(rest[1:]) + ';'
    return name + tstype(rest) + ';'      # a method: name(args): ret


def doc_of(src, pos):
    """The JSDoc immediately before `pos`, folded, or None."""
    head = src[:pos].rstrip()
    if head.endswith('*/'):
        j = head.rindex('/**')
        return fold(head[j:])
    return None


def interface(src, name):
    """(type params, extends clause, members) of `export interface name`, or of a type alias."""
    m = re.search(r'^export interface ' + name + r'\b(<[^>{]*>)?\s*(?:extends\s+([^{]*?))?\s*\{', src, re.M)
    if m:
        body, _ = block(src, m.end() - 1)
        return m.group(1) or '', (m.group(2) or '').strip(), members(body)
    m = re.search(r'^export type ' + name + r'\b(<[^>=]*>)?\s*=\s*([^;]+);', src, re.M)
    if m:
        return m.group(1) or '', m.group(2).strip(), []
    return None


NATIVE = [('ref', None, 'ref?: React.Ref'), ('className', '', 'className?: string'), ('id', '', 'id?: string'),
          ('style', '', 'style?: CSSProperties'), ('children', '', 'children?: React.ReactNode')]


def props_lines(comp, src, path):
    found = interface(src, comp + 'Props')
    if found is None:
        # KindGlyph: props inline in the signature
        m = re.search(r'^export function ' + comp + r'\(\{[^}]*\}\s*:\s*\{([^}]*)\}', src, re.M)
        tp, ext, own = '', '', members(m.group(1)) if m else []
    else:
        tp, ext, own = found
    lines, seen = [], set()

    def add(doc, decl):
        n = decl_name(decl)
        if n in seen:
            return
        seen.add(n)
        if n == 'ref':
            lines.append('  /** ' + (doc or '') + ' */' if doc else '  ' + REF)
            lines.append('  ref?: React.Ref;')
            return
        if doc:
            lines.append('  /** ' + doc + ' */')
        lines.append('  ' + norm_decl(decl))

    for doc, decl in own:
        add(doc, decl)
    omitted = set(re.findall(r"'(\w+)'", ext.split(',', 1)[1])) if ext.startswith('Omit<') and ',' in ext else set()
    base = re.sub(r'^Omit<\s*', '', ext).split(',')[0].strip()
    other = re.match(r'(\w+)Props(<[^>]*>)?$', base)
    if other and other.group(1) != comp:
        # another library component's props: list its members (TeamPicker <- ChoiceGroup)
        g, p, _ = find(other.group(1))
        osrc = open(p, encoding='utf8').read()
        _, oext, omem = interface(osrc, other.group(1) + 'Props')
        for doc, decl in omem:
            if decl_name(decl) not in omitted:
                add(doc, decl)
        ext = oext
        omitted |= set(re.findall(r"'(\w+)'", oext.split(',', 1)[1])) if oext.startswith('Omit<') and ',' in oext else set()
    native = 'ComponentPropsWithRef' in ext or 'HTMLAttributes' in ext
    if native or not found:
        for n, doc, decl in NATIVE:
            if n in omitted and n != 'ref':
                continue
            if n == 'ref' and 'ref' in omitted and 'ref' not in seen:
                continue
            if found is None and n not in ('className',):
                continue
            add(None if doc is None else '', decl)
    return tp, lines


def extra_types(comp, src):
    """The other exported types of the source file, as declaration text (KartPart-style)."""
    out = []
    for m in re.finditer(r'^export (interface|type) (\w+)\b', src, re.M):
        kind, name = m.groups()
        if name == comp + 'Props':
            continue
        doc = doc_of(src, m.start())
        head = ('/** ' + doc + ' */\n') if doc else ''
        if kind == 'type':
            t = re.match(r'export type (\w+)(<[^>=]*>)?\s*=\s*([^;]+);', src[m.start():], re.S)
            out.append(head + f'export type {name}{t.group(2) or ""} = {tstype(t.group(3)).replace(chr(39), chr(34))};')
        else:
            tp, ext, mem = interface(src, name)
            lines = [f'export interface {name}{tp}' + (f' extends {tstype(ext)}' if ext else '') + ' {']
            for d, decl in mem:
                if d:
                    lines.append('  /** ' + d + ' */')
                lines.append('  ' + norm_decl(decl))
            lines.append('}')
            out.append(head + '\n'.join(lines))
    return out


def tparam_names(tp):
    return '<' + ', '.join(re.findall(r'(\w+)\s+extends', tp)) + '>' if tp else ''


def section(comp, with_types=True):
    g, path, stories = find(comp)
    src = open(path, encoding='utf8').read()
    rel = os.path.relpath(stories or path, os.path.join(TREE, 'packages/ui'))
    tp, lines = props_lines(comp, src, path)
    parts = ['/**', f' * {comp} — from @politikart/ui@0.1.0 (./{rel}).', ' */']
    # a component without a story of its own shares its file's types with the one that has it
    types = extra_types(comp, src) if with_types and stories else []
    body = '\n'.join(parts) + '\n'
    if types:
        body += '\n\n'.join(types) + '\n\n'
    body += f'export interface {comp}Props{tp} {{\n' + '\n'.join(lines) + '\n}\n\n'
    body += f'export declare const {comp}: React.ComponentType<{comp}Props{tparam_names(tp)}>;'
    return g, body


def js_string(src, i):
    """Parse one or more concatenated JS string literals starting at src[i]."""
    out = ''
    while True:
        while src[i] in ' \n\t+':
            i += 1
        q = src[i]
        if q not in '\'"`':
            return out, i
        i += 1
        while src[i] != q:
            if src[i] == '\\':
                out += src[i + 1]
                i += 2
            else:
                out += src[i]
                i += 1
        i += 1
        j = i
        while j < len(src) and src[j] in ' \n\t':
            j += 1
        if j < len(src) and src[j] == '+':
            i = j + 1
            continue
        return out, i


def story_meta(stories):
    src = open(stories, encoding='utf8').read()
    m = re.search(r'description:\s*\{\s*component:\s*', src)
    desc = js_string(src, m.end())[0] if m else ''
    keys = re.findall(r'^export const ([A-Z]\w*)', src, re.M)
    mark = 'type Story = StoryObj<typeof meta>;'
    body = src[src.index(mark) + len(mark):].strip() if mark in src else ''
    return desc, keys, body


def spaced(k):
    return re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', k)


def readme(comp, sec):
    _, _, stories = find(comp)
    desc, keys, body = story_meta(stories)
    decls = sec.split(' */\n', 1)[1].split('\n\nexport declare const ' + comp + ':')[0].strip()
    decls = re.sub(r'^export ', '', decls, flags=re.M)
    out = [desc, '',
           f'{comp} from @politikart/ui. Use via `window.PolitikartUI.{comp}` (the bundle at `components/bundle.js`). '
           'Wrap the tree in `<PreviewRoot>` (full provider chain in README.md — components read theme/i18n from that context).', '',
           'Variants (see `preview.html`): ' + ', '.join(spaced(k) for k in keys) + '.', '',
           '## Props', '', '```ts', decls, '```', '',
           '## Examples', '', '```jsx', body, '```', '']
    for k in keys:
        out += [f'### {k}', '', '```jsx', f'/* {spaced(k)} */ compose(S, "{k}")', '```', '']
    return '\n'.join(out)


PREVIEW_STYLE = open(os.path.join(PUB, 'components/Showcase/preview.html'), encoding='utf8').read().split('\n')[3]
assert PREVIEW_STYLE.startswith('<style>'), PREVIEW_STYLE


def preview(comp, group):
    h = heights.get(comp, 600)
    return (f'<!-- @dsCard group="{group}" height={h} -->\n<!doctype html>\n'
            f'<html lang="fr"><head><meta charset="utf-8"><title>{comp}</title>\n{PREVIEW_STYLE}\n'
            '</head><body><div class="ds-grid" id="g"></div><script src="./stories.js"></script></body></html>\n')


def write(rel, text):
    p = os.path.join(STAGE, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf8', newline='\n').write(text)


secs_new = {}
for comp in COMPS:
    group, sec = section(comp)
    secs_new[comp] = sec
    if find(comp)[2] is None:
        continue                      # no story: an index.d.ts section only
    write(f'components/{comp}/{comp}.d.ts', "import * as React from 'react';\n\n" + sec + '\n')
    write(f'components/{comp}/README.md', readme(comp, sec))
    write(f'components/{comp}/preview.html', preview(comp, group))

# index.d.ts: the published sections, the listed ones regenerated, in the bundle's order.
idx = open(os.path.join(PUB, 'components/index.d.ts'), encoding='utf8').read()
tail_mark = '\n/** PreviewRoot — '
head_and_secs, tail = idx.split(tail_mark, 1)
parts = re.split(r'(?=^/\*\*\n \* \w+ — from )', head_and_secs, flags=re.M)
head, pub = parts[0], {re.match(r'/\*\*\n \* (\w+) — from', s).group(1): s.rstrip('\n') for s in parts[1:]}
order = [c['name'] for c in json.loads(re.match(r'/\* @ds-bundle: (.*) \*/', open(BUNDLE, encoding='utf8').readline()).group(1))['components']]
out = []
for n in order:
    s = secs_new.get(n) or pub.get(n)
    if s is None:
        raise SystemExit('no index section for ' + n + ': pass it as a Comp')
    out.append(s)
missing = set(pub) - set(order)
if missing:
    raise SystemExit('published sections not in the bundle: ' + ', '.join(sorted(missing)))
write('components/index.d.ts', head + '\n\n'.join(out) + '\n' + tail_mark + tail)
print('index sections', len(out), 'regenerated', len(secs_new))
