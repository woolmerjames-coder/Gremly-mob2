import json

with open('summary-v2-result.json') as f:
    d = json.load(f)

cards = d.get('summary', {}).get('cards', [])
print(f'Cards: {len(cards)}')

for c in cards:
    t = c.get('type', '?')
    if t == 'gremly_mood':
        print(f'  {t} | mood: {c.get("mood_line", "")} | hook: {c.get("hook", "")[:80]}')
    elif t == 'opening':
        print(f'  {t} | headline: {c.get("headline", "")} | engagement: {c.get("engagement", {})}')
    elif t == 'recommends':
        p = c.get('primary', {})
        s = c.get('secondary', [])
        print(f'  {t} | primary: {p.get("title", "")} ({p.get("type", "")})')
        print(f'    body: {p.get("body", "")}')
        for si in s:
            print(f'    - {si.get("title", "")} ({si.get("type", "")}): {si.get("body", "")}')
    elif t == 'moments':
        moms = c.get('moments', [])
        for m in moms:
            print(f'  {t} | {m.get("title", "")} | hint: {m.get("image_hint", "")} | url: {str(m.get("image_url", "none"))[:50]}')
    elif t == 'thread_movements':
        threads = c.get('threads', [])
        names = [th.get('name', '') for th in threads]
        print(f'  {t} | threads: {len(threads)} | names: {names}')
    elif t == 'stale_triage':
        items = c.get('items', [])
        print(f'  {t} | headline: {c.get("headline", "")} | items: {len(items)}')
        for it in items[:3]:
            print(f'    - {it.get("title", "")}: {it.get("days_stale", 0)}d ({it.get("domain", "")})')
        if len(items) > 3:
            print(f'    ... and {len(items) - 3} more')
    elif t == 'week_ahead':
        hl = c.get('highlights', [])
        titles = [h.get('title', '') for h in hl]
        print(f'  {t} | highlights: {len(hl)} | titles: {titles}')
    elif t == 'discoveries':
        sp = c.get('spotlight', {})
        minis = c.get('mini_discoveries', [])
        print(f'  {t} | spotlight: {sp.get("title", "")} | minis: {len(minis)}')
    else:
        print(f'  {t}')

# Unsplash
opening = next((c for c in cards if c['type'] == 'opening'), None)
if opening:
    print(f'Opening image_url: {str(opening.get("image_url", "none"))[:60]}')

# Card order
order = [c['type'] for c in cards]
expected = ['gremly_mood', 'opening', 'moments', 'thread_movements', 'discoveries', 'recommends', 'stale_triage', 'week_ahead']
# stale_triage may or may not be present
expected_no_stale = [x for x in expected if x != 'stale_triage']
if order == expected:
    print(f'Card order: CORRECT (with stale_triage)')
elif order == expected_no_stale:
    print(f'Card order: CORRECT (no stale_triage)')
else:
    print(f'Card order: MISMATCH')
    print(f'  Actual:   {order}')
    print(f'  Expected: {expected}')
