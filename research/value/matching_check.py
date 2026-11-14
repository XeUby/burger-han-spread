"""Use NetworkX as an independent oracle for the existing matching subproblem."""

import json
import random
import subprocess
from pathlib import Path
import networkx as nx

ROOT=Path(__file__).resolve().parents[2]
rng=random.Random(170114)
graphs=[]
for n in [2,4,6,10,14,20]:
    for trial in range(8):
        graphs.append({"n":n,"kind":"exact-component", "edges":[[a,b,rng.randint(1,10000)] for a in range(n) for b in range(a+1,n) if rng.random()<.25]})
graphs.append({"n":25,"kind":"large-component-greedy-counterexample","edges":[[0,1,100],[0,2,99],[1,3,99]]+[[i,i+1,1] for i in range(3,24)]})
result=json.loads(subprocess.run(["node","research/value/matching-check.ts"],cwd=ROOT,input=json.dumps(graphs),text=True,capture_output=True,check=True).stdout)
rows=[]
for graph,custom in zip(graphs,result["rows"]):
    g=nx.Graph();g.add_nodes_from(range(graph["n"]));g.add_weighted_edges_from(graph["edges"])
    selected=nx.max_weight_matching(g,maxcardinality=False,weight="weight")
    weight=sum(g[a][b]["weight"] for a,b in selected)
    if graph["kind"]=="exact-component":
        assert weight==custom["weight"]
    rows.append({"nodes":graph["n"],"edges":len(graph["edges"]),"kind":graph["kind"],"networkxWeight":weight,"dispatcherWeight":custom["weight"],"gap":weight-custom["weight"]})
report={"networkxVersion":nx.__version__,"dispatcherSourceSha256":result["sourceSha256"],"integerWeights":True,"maximumCardinality":False,"exactCases":48,"allExactCasesMatched":True,"cases":rows,"decision":"Use NetworkX for offline matching and as an independent reference. The existing dispatcher is exact only within its <=20-node component path; its larger-component greedy fallback has no general optimum guarantee. This graph-level check does not estimate policy profit or certify the full dispatch problem.","documentation":"https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.matching.max_weight_matching.html"}
(ROOT/"docs/value-networkx-check.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps({"exactCases":48,"allExactCasesMatched":True,"largeComponent":rows[-1]}))
