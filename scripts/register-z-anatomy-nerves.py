"""Reproduce body or distal rigid fits from the importer's --review-dir anchors.

Requires numpy and scipy. Writes a candidate transform, never atlas assets.
Review measured residuals and appearance before changing the pinned recipe.
"""
import argparse
import json
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree

parser = argparse.ArgumentParser()
parser.add_argument("--anchors", type=Path, required=True)
parser.add_argument("--out", type=Path, required=True)
parser.add_argument("--mode", choices=["body", "distal"], default="body")
args = parser.parse_args()
pairs = json.loads(args.anchors.read_text())
for pair in pairs:
    pair["source"] = np.asarray(pair["source"], dtype=float)
    pair["target"] = np.asarray(pair["target"], dtype=float)
    pair["tree"] = cKDTree(pair["target"])

def rigid(source, target):
    a, b = source.mean(0), target.mean(0)
    u, _, vt = np.linalg.svd((source - a).T @ (target - b))
    correction = np.eye(3)
    correction[2, 2] = np.linalg.det(vt.T @ u.T)
    rotation = vt.T @ correction @ u.T
    return rotation, b - rotation @ a

if args.mode == "distal":
    regions = []
    for region in sorted(set(p["region"] for p in pairs)):
        regional = [p for p in pairs if p["region"] == region]
        fitting = [p for p in regional if p["usedForFit"]]
        rotation, offset = rigid(np.asarray([p["source"].mean(0) for p in fitting]),
                                 np.asarray([p["target"].mean(0) for p in fitting]))
        for iteration in range(80):
            originals, matches = [], []
            for pair in fitting:
                distance, index = pair["tree"].query(pair["source"] @ rotation.T + offset)
                keep = distance <= np.quantile(distance, 0.8)
                originals.append(pair["source"][keep])
                matches.append(pair["target"][index[keep]])
            rotation, offset = rigid(np.concatenate(originals), np.concatenate(matches))
        regions.append(dict(region=region, rotation=rotation.tolist(), offset=offset.tolist()))
    args.out.write_text(json.dumps(regions, indent=2) + "\n")
    print(f"Registered four extremities against {sum(p['usedForFit'] for p in pairs)} bones; "
          f"measured {sum(not p['usedForFit'] for p in pairs)} held-out finger/toe bones.")
    raise SystemExit(0)

fitting = [pair for pair in pairs if pair["usedForFit"]]
rotation = np.eye(3)
offset = np.mean([p["target"].mean(0) - p["source"].mean(0) for p in fitting], axis=0)
for iteration in range(60):
    originals, matches = [], []
    for pair in fitting:
        distance, index = pair["tree"].query(pair["source"] @ rotation.T + offset)
        keep = distance <= np.quantile(distance, 0.8)
        originals.append(pair["source"][keep])
        matches.append(pair["target"][index[keep]])
    source, target = np.concatenate(originals), np.concatenate(matches)
    a, b = source.mean(0), target.mean(0)
    u, _, vt = np.linalg.svd((source - a).T @ (target - b))
    rotation = vt.T @ u.T
    if np.linalg.det(rotation) < 0:
        raise ValueError("Rigid registration must not mirror left and right.")
    offset = b - rotation @ a
metrics = []
for pair in pairs:
    distance, _ = pair["tree"].query(pair["source"] @ rotation.T + offset)
    metrics.append(dict(id=pair["id"], sourceName=pair["sourceName"], usedForFit=pair["usedForFit"],
                        medianMm=float(np.median(distance) * 1000),
                        p95Mm=float(np.quantile(distance, 0.95) * 1000), maxMm=float(distance.max() * 1000)))
args.out.write_text(json.dumps(dict(rotation=rotation.tolist(), offset=offset.tolist(), landmarks=metrics), indent=2) + "\n")
print(f"Registered against {len(fitting)} bones; measured {len(pairs) - len(fitting)} held-out bones.")
