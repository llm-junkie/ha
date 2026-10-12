"""Join posed hand/foot surface patches to the fitted HRA skin at smooth collars."""
import numpy as np


def clip_plane(vertices, faces, height, keep_above, eligible=None):
    """Clip triangles at a horizontal plane, sharing new vertices along edges."""
    points = vertices.tolist()
    output = []
    intersections = {}
    if eligible is None:
        eligible = np.ones(len(faces), dtype=bool)
    def crossing(a, b):
        key = tuple(sorted((a, b)))
        if key not in intersections:
            t = (height - vertices[a, 1]) / (vertices[b, 1] - vertices[a, 1])
            p = vertices[a] + t * (vertices[b] - vertices[a])
            p[1] = height
            intersections[key] = len(points)
            points.append(p.tolist())
        return intersections[key]
    for face, selected in zip(faces, eligible):
        inside = (vertices[face, 1] >= height) if keep_above else (vertices[face, 1] <= height)
        if not selected or inside.all():
            output.append(face.tolist())
        elif inside.any():
            polygon = []
            for j in range(3):
                a, b = int(face[j]), int(face[(j + 1) % 3])
                if inside[j]: polygon.append(a)
                if inside[j] != inside[(j + 1) % 3]: polygon.append(crossing(a, b))
            for j in range(1, len(polygon) - 1):
                output.append([polygon[0], polygon[j], polygon[j + 1]])
    return np.array(points), np.array(output, dtype=np.uint32)


def boundary_ring(vertices, faces, height):
    edges = np.sort(np.r_[faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]], axis=1)
    edges, count = np.unique(edges, axis=0, return_counts=True)
    edges = edges[(count == 1) & (abs(vertices[edges, 1] - height) < 1e-7).all(axis=1)]
    if not len(edges): raise ValueError('No skin collar boundary')
    adjacent = {}
    for a, b in edges:
        adjacent.setdefault(int(a), []).append(int(b))
        adjacent.setdefault(int(b), []).append(int(a))
    if any(len(v) != 2 for v in adjacent.values()): raise ValueError('Skin collar is not a simple loop')
    first = min(adjacent)
    ring = [first]
    while True:
        following = [i for i in adjacent[ring[-1]] if len(ring) < 2 or i != ring[-2]][0]
        if following == first: break
        if following in ring: raise ValueError('Skin collar repeats a vertex')
        ring.append(following)
    if len(ring) != len(adjacent): raise ValueError('Skin collar has multiple loops')
    return np.array(ring)


def ordered_ring(vertices, ring):
    p = vertices[ring][:, [0, 2]]
    center = (p.max(axis=0) + p.min(axis=0)) / 2
    # Follow the actual boundary order, including small source fitting ripples.
    area = np.sum(p[:, 0] * np.roll(p[:, 1], -1) - p[:, 1] * np.roll(p[:, 0], -1))
    if area < 0: ring = ring[::-1]
    p = vertices[ring][:, [0, 2]]
    angles = np.mod(np.arctan2(p[:, 1] - center[1], p[:, 0] - center[0]), 2 * np.pi)
    start = int(np.argmin(angles))
    ring = np.roll(ring, -start)
    p = vertices[ring][:, [0, 2]]
    lengths = np.linalg.norm(np.roll(p, -1, axis=0) - p, axis=1)
    return ring, np.r_[0, np.cumsum(lengths)] / lengths.sum()


def replace_extremities(vertices, faces, donor, settings):
    original_count = len(vertices)
    statistics = []
    for region in settings['regions']:
        name, side, upper, lower = region['name'], region['side'], region['bodyCutM'], region['patchCutM']
        centers = vertices[faces].mean(axis=1)
        if 'hand' in name:
            selected = (centers[:, 0] * side > .195) & (centers[:, 1] > .60) & (centers[:, 1] < 1.0)
        else:
            selected = (centers[:, 0] * side > .01) & (centers[:, 1] < .25)
        vertices, faces = clip_plane(vertices, faces, upper, True, selected)
        # Filter the collar of this side; other body boundaries remain intact.
        collar_faces = faces[(vertices[faces][:, :, 0] * side > (.18 if 'hand' in name else .005)).all(axis=1)]
        body_ring = boundary_ring(vertices, collar_faces, upper)
        patch_v, patch_f = donor[name + '_vertices'], donor[name + '_faces']
        patch_ring = donor[name + '_ring']
        offset = len(vertices)
        vertices = np.r_[vertices, patch_v]
        patch_ring = patch_ring + offset
        a, ta = ordered_ring(vertices, body_ring)
        b, tb = ordered_ring(vertices, patch_ring)
        seam = []
        i = j = 0
        while i < len(a) or j < len(b):
            if i < len(a) and (j == len(b) or ta[i + 1] <= tb[j + 1]):
                seam.append([a[i % len(a)], a[(i + 1) % len(a)], b[j % len(b)]]); i += 1
            else:
                seam.append([a[i % len(a)], b[(j + 1) % len(b)], b[j % len(b)]]); j += 1
        seam = np.array(seam, dtype=np.uint32)
        tri = vertices[seam]
        normals = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        midpoint = tri.mean(axis=1)
        center = vertices[np.r_[a, b]].mean(axis=0)
        radial = midpoint - center; radial[:, 1] = 0
        if np.einsum('ij,ij->i', normals, radial).sum() < 0: seam = seam[:, ::-1]
        faces = np.r_[faces, patch_f + offset, seam]
        statistics.append({'region': name, 'bodyBoundaryVertices': len(a), 'patchBoundaryVertices': len(b), 'seamTriangles': len(seam), 'patchTriangles': len(patch_f)})
    used, inverse = np.unique(faces, return_inverse=True)
    source_indices = np.where(used < original_count, used, -1)
    return vertices[used], inverse.reshape(-1, 3).astype(np.uint32), source_indices, {'settings': settings, 'collars': statistics}
