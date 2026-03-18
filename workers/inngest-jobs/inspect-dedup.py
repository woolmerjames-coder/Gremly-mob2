import json, sys

d = json.load(open("summary-v2-dedup.json"))
cards = d.get("summary", {}).get("cards", [])
meta = d.get("summary", {}).get("metadata", {})
print("Cards:", len(cards))
print("Types:", [c["type"] for c in cards])
print("Mood:", meta.get("mood"))
print("Week type:", meta.get("week_type"))

opening = cards[0] if cards else {}
print("\n--- Opening card new fields ---")
print("quote:", opening.get("quote", "MISSING"))
print("quote_date:", opening.get("quote_date", "MISSING"))
print("image_hint:", opening.get("image_hint", "MISSING"))

tm = next((c for c in cards if c["type"] == "thread_movements"), None)
if tm:
    print("\n--- Thread badge_labels ---")
    for t in tm.get("threads", []):
        print("  %s: badge_label=%s" % (t["name"], t.get("badge_label", "MISSING")))

wa = next((c for c in cards if c["type"] == "week_ahead"), None)
if wa:
    print("\n--- Week ahead icon_hints ---")
    for h in wa.get("highlights", []):
        print("  %s: icon_hint=%s" % (h["title"], h.get("icon_hint", "MISSING")))

disc = next((c for c in cards if c["type"] == "discoveries"), None)
if disc:
    sp = disc.get("spotlight", {})
    rc = sp.get("research_context", {})
    print("\n--- Discoveries spotlight ---")
    print("Title:", sp.get("title"))
    print("Evidence trail (first 400 chars):", sp.get("evidence_trail", "")[:400])
    print("Research title:", rc.get("title"))
    print("Research body:", rc.get("body", ""))
