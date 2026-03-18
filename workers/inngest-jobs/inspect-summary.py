import json, sys

d = json.load(sys.stdin)
sm = d.get("summary_metadata", {})
am = d.get("analyst_metadata", {})
rm = d.get("rebuild_metadata", {})

print("=== Pipeline Metadata ===")
print("Analyst: %.1fs | %d in / %d out" % (am.get("latency_ms",0)/1000, am.get("input_tokens",0), am.get("output_tokens",0)))
print("Rebuild: %.1fs | %d in / %d out" % (rm.get("latency_ms",0)/1000, rm.get("input_tokens",0), rm.get("output_tokens",0)))
print("Summary: %.1fs | %d in / %d out" % (sm.get("latency_ms",0)/1000, sm.get("input_tokens",0), sm.get("output_tokens",0)))
print()

cards = d.get("summary", {}).get("cards", [])
print("=== Cards (%d) ===" % len(cards))

for i, c in enumerate(cards):
    t = c.get("type", "?")
    if t == "opening":
        print("%d. %s: \"%s\" [%s] -- %s" % (i+1, t, c.get("headline",""), c.get("subheadline",""), c.get("mood","")))
    elif t == "thread_movements":
        threads = c.get("threads", [])
        print("%d. %s: %d threads" % (i+1, t, len(threads)))
        for th in threads:
            hl = "*" if th.get("is_highlight") else " "
            print("   %s %s: %s (%s)" % (hl, th.get("name",""), th.get("shift_label",""), th.get("direction","")))
    elif t == "moments":
        moms = c.get("moments", [])
        print("%d. %s: %d moments" % (i+1, t, len(moms)))
        for m in moms:
            print("   %s %s: %s" % (m.get("day_label",""), m.get("date",""), m.get("title","")))
    elif t == "pattern":
        print("%d. %s: \"%s\"" % (i+1, t, c.get("headline","")))
    elif t == "stale_triage":
        print("%d. %s: \"%s\" (%d items)" % (i+1, t, c.get("headline",""), len(c.get("items",[]))))
    elif t == "week_ahead":
        print("%d. %s: %d highlights" % (i+1, t, len(c.get("highlights",[]))))
    elif t == "recommendation":
        print("%d. %s: \"%s\"" % (i+1, t, c.get("text","")))
    elif t == "monthly_retro":
        print("%d. %s: \"%s\"" % (i+1, t, c.get("headline","")))
    else:
        print("%d. %s" % (i+1, t))

meta = d.get("summary", {}).get("metadata", {})
print()
print("Week type: %s | Mood: %s" % (meta.get("week_type","?"), meta.get("mood","?")))
print("Themes: %s" % ", ".join(meta.get("key_themes", [])))
