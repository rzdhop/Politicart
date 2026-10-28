import re,sys
# bundle.css = dist/styles.css with the custom properties dropped from the :root
# token block (tokens.css is the one source of the tokens); other declarations kept.
s=open(sys.argv[1]).read()
m=re.search(r':root\{(--bg:[^}]*)\}', s)
assert m, 'no token block'
decls=[d for d in re.split(r';(?=(?:[^"]*"[^"]*")*[^"]*$)', m.group(1)) if d.strip() and not d.strip().startswith('--')]
out=s[:m.start()]+':root{'+';'.join(decls)+'}'+s[m.end():]
assert '</style' not in out.lower()
open(sys.argv[2],'w').write(out)
print('kept', decls)
