# Rewrites the template's cast.js: the game's pun names and copy (apps/game/src/engine/data.js),
# keyed by the game's ids, each over the template entry's 3D look (plan section 3.1).
# usage: castgen.py <template dir>   (the folder holding cast.js; rewritten in place)
import re, json, os, subprocess, sys
T = sys.argv[1]
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'apps', 'game', 'src', 'engine', 'data.js')
src = open(T + '/cast.js', encoding='utf8').read()
# The game id for each of the template's eleven slots, in the template's order
# (plan section 3.1). By position, so the template's own ids never appear here,
# and a cast.js this script already rewrote maps to itself.
GAME_IDS = ['bernadette', 'kevin', 'hubert', 'victor', 'lulu', 'aymeric', 'gege', 'patrick', 'maurice', 'martine', 'gaspard']
js = '''
import { CHARACTERS } from %s;
console.log(JSON.stringify(CHARACTERS.map(c => ({ id: c.id, name: c.name, title: c.title, quote: c.quote, stats: c.stats, power: c.power }))));
''' % json.dumps('file://' + os.path.abspath(DATA))
game = {c['id']: c for c in json.loads(subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True, check=True).stdout)}
looks = [m.group(1) for m in re.finditer(r"\{id:['\"]\w+['\"],.*?\n(look:\{.*?\})\}", src, re.S)]
assert len(looks) == len(GAME_IDS), len(looks)
frac = lambda s: round((s - 0.6) / 0.6, 2)
q = lambda s: json.dumps(s, ensure_ascii=False)
out = ['// Roster data: copy + look. Read by app.jsx (UI) and characters.js (3D).',
       '//',
       '// The copy is the game\'s own (apps/game/src/engine/data.js): pun names, titles,',
       '// lines and powers, keyed by the game\'s ids. Stats are the game\'s, shown as the',
       '// game shows them: (stat - 0.6) / 0.6, so 0.6 is an empty bar and 1.2 a full one.',
       '// Each `look` is the 3D sketch this template drew for that slot, kept as a',
       '// technique reference (shapes, fabrics, poses, props); the game builds its own',
       '// pilots from each candidate\'s look, colours and power.',
       'window.CAST = [']
rows = []
for gid, look in zip(GAME_IDS, looks):
    g = game[gid]
    st = g['stats']
    rows.append('{id:%s,name:%s,title:%s,quote:%s,stats:{speed:%s,accel:%s,handling:%s},power:{name:%s,desc:%s},\n%s}' % (
        q(gid), q(g['name']), q(g['title']), q(g['quote']), frac(st['speed']), frac(st['accel']), frac(st['handling']),
        q(g['power']['name']), q(g['power']['desc']), look))
out.append(',\n'.join(rows))
out.append('];\n')
open(T + '/cast.js', 'w', encoding='utf8', newline='\n').write('\n'.join(out))
print('\n'.join(r.split('\n')[0][:140] for r in rows))
