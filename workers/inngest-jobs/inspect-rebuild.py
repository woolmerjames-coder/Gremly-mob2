import json, sys

d = json.load(sys.stdin)
print("=== Top-level keys ===")
for k in d:
    print("  " + k)
print()

am = d.get("analyst_metadata", {})
rm = d.get("rebuild_metadata", {})

print("=== Analyst: %s ===" % am["model"])
print("  Latency: %.1fs | Input: %d | Output: %d" % (am["latency_ms"]/1000, am["input_tokens"], am["output_tokens"]))
print("  Events: %d | Payload: %d chars" % (am["cleaned_events_count"], am["data_payload_chars"]))
print()
print("=== Rebuild: %s ===" % rm["model"])
print("  Latency: %.1fs | Input: %d | Output: %d" % (rm["latency_ms"]/1000, rm["input_tokens"], rm["output_tokens"]))
print("  Domains: %d | Threads: %d | Version: %d" % (rm["domains"], rm["threads"], rm["version"]))
print()

lm = d.get("rebuilt_life_map", {})
domains = lm.get("domains", [])
print("=== Life Map Thread Structure ===")
print("%-30s %8s" % ("Domain", "Threads"))
print("-" * 40)
total = 0
for dom in domains:
    threads = dom.get("threads", [])
    total += len(threads)
    print("%-30s %8d" % (dom["name"], len(threads)))
    for t in threads:
        print("  > " + t["name"])
print("-" * 40)
print("%-30s %8d" % ("TOTAL", total))
