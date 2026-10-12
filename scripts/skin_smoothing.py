"""Conservative mesh relaxation for the fitted female skin.

Alternating Taubin steps reduce local contour noise without ordinary Laplacian
shrinkage. Final displacement and inward movement are bounded; every delivered
triangle must retain its orientation relative to the fitted surface.
"""
import numpy as np
from scipy.sparse import coo_matrix


def smoothstep(a, b, values):
    t = np.clip((values - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def face_vectors(vertices, faces):
    triangles = vertices[faces].astype(float)
    return np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])


def smooth_skin(vertices, faces, settings):
    original = vertices.astype('<f4').astype(float)
    edges = np.unique(np.sort(np.r_[faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]], axis=1), axis=0)
    length = np.linalg.norm(original[edges[:, 0]] - original[edges[:, 1]], axis=1)
    edge_weight = 1 / np.maximum(length, settings['minimumEdgeWeightLengthM'])
    adjacent = coo_matrix((np.r_[edge_weight, edge_weight],
        (np.r_[edges[:, 0], edges[:, 1]], np.r_[edges[:, 1], edges[:, 0]])),
        shape=(len(original), len(original))).tocsr()
    adjacent = adjacent.multiply(1 / np.asarray(adjacent.sum(axis=1))).tocsr()
    x, y, _ = original.T
    head = smoothstep(1.34, 1.44, y)
    hands = (1 - smoothstep(.82, .91, y)) * smoothstep(.18, .22, abs(x)) * smoothstep(.60, .69, y)
    feet = 1 - smoothstep(.12, .20, y)
    detail = (1 - .80 * head) * (1 - .75 * hands) * (1 - .80 * feet)
    candidate = original.copy()
    for _ in range(settings['iterations']):
        for step in [settings['lambda'], settings['mu']]:
            candidate += step * detail[:, None] * (adjacent @ candidate - candidate)

    original_faces = face_vectors(original, faces)
    normals = np.zeros_like(original)
    for corner in range(3):
        np.add.at(normals, faces[:, corner], original_faces)
    normal_lengths = np.linalg.norm(normals, axis=1)
    normals /= np.maximum(normal_lengths[:, None], 1e-14)
    displacement = candidate - original
    # Preserve room around the existing anatomy, particularly fine extremities.
    inward_limit = settings['detailInwardLimitM'] + detail * (settings['bodyInwardLimitM'] - settings['detailInwardLimitM'])
    normal_shift = np.einsum('ij,ij->i', displacement, normals)
    displacement += normals * np.maximum(-inward_limit - normal_shift, 0)[:, None]
    cap = settings['detailDisplacementLimitM'] + detail * (settings['bodyDisplacementLimitM'] - settings['detailDisplacementLimitM'])
    magnitude = np.linalg.norm(displacement, axis=1)
    # A smooth cap avoids creating a new crease where a hard distance limit starts.
    displacement *= (cap * np.tanh(magnitude / cap) / np.maximum(magnitude, 1e-14))[:, None]

    blend = np.ones(len(original))
    for attempt in range(100):
        result = (original + displacement * blend[:, None]).astype('<f4')
        vectors = face_vectors(result, faces)
        agreement = np.einsum('ij,ij->i', vectors, original_faces)
        area = np.linalg.norm(vectors, axis=1)
        bad = (agreement <= 0) | (area <= 2e-14)
        if not bad.any():
            break
        blend[np.unique(faces[bad])] *= .5
        # Taper reduced motion into neighboring vertices instead of pinning a sharp seam.
        blend = np.minimum(blend, .5 * (blend + adjacent @ blend))
    else:
        raise ValueError('Mesh smoothing could not preserve all triangle orientations')

    body = detail > .90
    before_energy = np.mean(np.sum((adjacent @ original - original)[body] ** 2, axis=1))
    after_energy = np.mean(np.sum((adjacent @ result - result)[body] ** 2, axis=1))
    actual = np.linalg.norm(result.astype(float) - original, axis=1)
    original_volume = np.einsum('ij,ij->i', original[faces[:, 0]], original_faces).sum() / 6
    final_volume = np.einsum('ij,ij->i', result[faces[:, 0]], vectors).sum() / 6
    return result, {
        'method': 'Distance-weighted Taubin relaxation, detail masks, smooth displacement caps and local orientation backtracking',
        'settings': settings,
        'vertices': len(original),
        'trianglesChecked': len(faces),
        'reversedTriangles': int((agreement <= 0).sum()),
        'maximumDisplacementM': float(actual.max()),
        'p95DisplacementM': float(np.quantile(actual, .95)),
        'rmsDisplacementM': float(np.sqrt(np.mean(actual ** 2))),
        'bodyLaplacianEnergyRatio': float(after_energy / before_energy),
        'signedVolumeRatio': float(final_volume / original_volume),
        'backtrackingPasses': attempt,
    }
