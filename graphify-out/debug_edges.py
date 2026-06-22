import json
from pathlib import Path

extract = json.loads(Path('graphify-out/.graphify_extract.json').read_text(encoding='utf-8'))
nodes = {n['id']: n for n in extract['nodes']}
edges = extract['edges']

valid_edges = 0
invalid_edges = []

for e in edges:
    s = e['source']
    t = e['target']
    if s in nodes and t in nodes:
        valid_edges += 1
    else:
        invalid_edges.append((s, t))

print(f"Total nodes: {len(nodes)}")
print(f"Total edges: {len(edges)}")
print(f"Valid edges: {valid_edges}")
print(f"Invalid edges: {len(invalid_edges)}")
if invalid_edges:
    print("Some invalid edges (source -> target):")
    for s, t in invalid_edges[:10]:
        print(f"  {s} ({s in nodes}) -> {t} ({t in nodes})")
