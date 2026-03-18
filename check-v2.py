import json

d = json.load(open('summary-v2-complete.json'))
cards = d.get('summary', {}).get('cards', [])
print("Total cards:", len(cards))
print()

# 1. Engagement on opening card
opening = [c for c in cards if c.get('type') == 'opening']
if opening:
    eng = opening[0].get('engagement')
    print("Opening engagement:", json.dumps(eng))
else:
    print("No opening card found")

print()

# 2. image_url fields
for c in cards:
    url = c.get('image_url')
    if url:
        print("Card [%s] image_url: %s" % (c['type'], url[:100]))
    for m in c.get('moments', []):
        murl = m.get('image_url')
        if murl:
            title = m.get('title', '?')
            print("  Moment [%s] image_url: %s" % (title, murl[:100]))

print()

# 3. item_id on stale items
stale = [c for c in cards if c.get('type') == 'stale_triage']
if stale:
    for item in stale[0].get('items', []):
        t = item.get('title', '?')
        iid = item.get('item_id')
        print("Stale: '%s' item_id=%s" % (t, iid))
else:
    print("No stale_triage card found")
