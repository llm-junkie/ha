"""Replay the pinned skin registration. Requires numpy and scipy; no Blender.

The paired controls are an estimated surface registration, not clinical landmarks.
The source is simplified by import-female-skin.mjs before this script runs.
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.interpolate import RBFInterpolator
from skin_smoothing import smooth_skin, smoothstep, face_vectors
from skin_head_profile import head_profile_adjustment, face_alignment_adjustment
from skin_breast_envelope import breast_envelope_adjustment
from skin_forearm_envelope import forearm_envelope_adjustment
from skin_extremities import replace_extremities

folder = Path(sys.argv[1])
recipe = json.loads(Path(sys.argv[2]).read_text())
positions = np.fromfile(folder / 'source-positions.bin', '<f4').reshape(-1, 3).astype(float)
faces = np.fromfile(folder / 'source-indices.bin', '<u4').reshape(-1, 3)
controls = np.array(recipe['registration']['positions'])
targets = np.array(recipe['registration']['targets'])
regularization = recipe['registration']['smoothing']
if recipe['registration'].get('torsoControlSmoothing'):
    torso = (smoothstep(.85, .98, controls[:, 1])
             * (1 - smoothstep(1.32, 1.42, controls[:, 1]))
             * (1 - smoothstep(.17, .24, abs(controls[:, 0]))))
    regularization = regularization + recipe['registration']['torsoControlSmoothing'] * torso
field = RBFInterpolator(controls, targets - controls, smoothing=regularization)

def displacement(points):
    return np.concatenate([field(q) for q in np.array_split(points, max(1, len(points) // 700))])

def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def clearance(points):
    q = points + displacement(points)
    envelope = recipe['registration'].get('clearanceEnvelope')
    if not envelope:
        return q
    x, y, z = q.T
    leg = 1 - smooth(.70, .80, y)
    arm = smooth(.18, .23, np.abs(x)) * (1 - smooth(1.12, 1.32, y)) * smooth(.65, .78, y)
    head = smooth(1.31, 1.45, y)
    knee = smooth(.32, .40, y) * (1 - smooth(.48, .56, y))
    ankle = 1 - smooth(.12, .20, y)
    scale = (envelope['bodyScale'] + leg * (envelope['limbScale'] - envelope['bodyScale'])
             + arm * (envelope['limbScale'] - envelope['bodyScale'])
             + head * (envelope['headScale'] - envelope['bodyScale'])
             + knee * envelope['kneeExtraScale'] + ankle * envelope['footExtraScale'])
    neck = smooth(1.32, 1.38, y) * (1 - smooth(1.43, 1.49, y))
    scale += neck * envelope['neckExtraScale']
    arm_center = np.interp(y, [.68, .84, 1.0, 1.12, 1.32], [.265, .25, .23, .18, .15])
    # Smooth sign avoids a discontinuity at the medial crotch surface.
    center_x = np.tanh(x / .025) * (leg * .075 + arm * arm_center)
    center_z = -.02 + arm * np.interp(y, [.68, .84, 1.0, 1.12], [.10, .03, -.006, -.02])
    q[:, 0] = center_x + (x - center_x) * scale
    depth_scale = scale + head * envelope.get('posteriorHeadExtraScale', 0) * (1 - smooth(-.01, .025, z))
    q[:, 2] = center_z + (z - center_z) * depth_scale
    return q

def posterior_shift(points):
    settings = recipe['registration'].get('posteriorTightening')
    if not settings:
        return np.zeros(len(points))
    x, y, z = points.T
    back = smooth(*settings['backHeightFadeInM'], y) * (1 - smooth(*settings['backHeightFadeOutM'], y))
    neck = smooth(*settings['neckHeightFadeInM'], y)
    neck_top = 1 - smooth(*settings['neckHeightFadeOutM'], y)
    # Keep more room over the spinous processes and taper before the shoulders.
    spine = settings['centralBackWeight'] + (1 - settings['centralBackWeight']) * smooth(*settings['spineWidthFadeM'], abs(x))
    lateral = 1 - smooth(*settings['lateralWidthFadeM'], abs(x))
    posterior = 1 - smooth(*settings['posteriorDepthFadeM'], z)
    return (settings['backShiftM'] * back * spine * (1 - neck)
            + settings['neckShiftM'] * neck * neck_top) * lateral * posterior

def fit(points):
    q = clearance(points)
    q[:, 2] += posterior_shift(q)
    q += head_neck_adjustment(q)
    q += head_profile_adjustment(q, recipe['registration'].get('headProfileRegistration'))
    q += breast_envelope_adjustment(q, recipe['registration'].get('breastEnvelope'))
    q += face_alignment_adjustment(q, recipe['registration'].get('faceAlignment'))
    return q

def head_neck_adjustment(points):
    settings = recipe['registration'].get('headNeckTightening')
    delta = np.zeros_like(points)
    if not settings:
        return delta
    x, y, z = points.T
    neck = smooth(*settings['neckHeightFadeInM'], y) * (1 - smooth(*settings['neckHeightFadeOutM'], y))
    shoulder = 1 - smooth(*settings['shoulderWidthFadeM'], abs(x))
    face = 1 - smooth(*settings['anteriorDepthFadeM'], z)
    crown_width = smooth(*settings['crownWidthHeightFadeM'], y)
    crown_height = smooth(*settings['crownHeightFadeM'], y)
    delta[:, 0] = -x * (settings['neckWidthReduction'] * neck * shoulder * face
                       + settings['crownWidthReduction'] * crown_width)
    delta[:, 1] = -settings['crownLoweringM'] * crown_height
    return delta

cleared = clearance(positions)
shift = posterior_shift(cleared)
fitted = cleared.copy()
fitted[:, 2] += shift
head_neck_base = fitted.copy()
head_neck_delta = head_neck_adjustment(head_neck_base)
fitted += head_neck_delta
head_profile_base = fitted.copy()
head_profile_delta = head_profile_adjustment(head_profile_base, recipe['registration'].get('headProfileRegistration'))
fitted += head_profile_delta
breast_base = fitted.copy()
breast_delta = breast_envelope_adjustment(breast_base, recipe['registration'].get('breastEnvelope'))
fitted += breast_delta
face_alignment_base = fitted.copy()
face_alignment_delta = face_alignment_adjustment(face_alignment_base, recipe['registration'].get('faceAlignment'))
fitted += face_alignment_delta
# Check every source vertex, plus a separate sample inside source triangles.
sample = np.r_[positions, positions[faces[::32]].mean(axis=1)]
jacobian = np.tile(np.eye(3), (len(sample), 1, 1))
h = 1e-5
for axis in range(3):
    step = np.eye(3)[axis] * h
    jacobian[:, :, axis] = (fit(sample + step) - fit(sample - step)) / (2 * h)
determinants = np.linalg.det(jacobian)
if not np.isfinite(fitted).all() or determinants.min() <= 0:
    raise ValueError(f'Skin registration folds: minimum sampled Jacobian {determinants.min()}')

relaxation = None
if recipe['registration'].get('meshSmoothing'):
    fitted, relaxation = smooth_skin(fitted, faces, recipe['registration']['meshSmoothing'])

extremities = None
source_indices = np.arange(len(positions))
if recipe['registration'].get('posedExtremities'):
    settings = recipe['registration']['posedExtremities']
    patches = np.load(Path(sys.argv[2]).parent / settings['path'])
    fitted, faces, source_indices, extremities = replace_extremities(fitted, faces, patches, settings)

# Apply the final localized envelope after joining so the reviewed hand/foot
# collars and every vertex outside the adjustment retain their exact positions.
forearm_base = fitted.astype('<f4').astype(float)
forearm_settings = recipe['registration'].get('forearmEnvelope')
forearm_delta = forearm_envelope_adjustment(forearm_base, forearm_settings)
forearm_sample = np.r_[forearm_base, forearm_base[faces[::32]].mean(axis=1)]
forearm_jacobian = np.tile(np.eye(3), (len(forearm_sample), 1, 1))
for axis in range(3):
    step = np.eye(3)[axis] * h
    forearm_jacobian[:, :, axis] += (
        forearm_envelope_adjustment(forearm_sample + step, forearm_settings)
        - forearm_envelope_adjustment(forearm_sample - step, forearm_settings)
    ) / (2 * h)
forearm_determinants = np.linalg.det(forearm_jacobian)
if not np.isfinite(forearm_determinants).all() or forearm_determinants.min() <= 0:
    raise ValueError('The forearm envelope folds the relaxed skin')
fitted = (forearm_base + forearm_delta).astype('<f4')
forearm_agreement = np.einsum('ij,ij->i', face_vectors(forearm_base, faces), face_vectors(fitted, faces))
if (forearm_agreement <= 0).any():
    raise ValueError('The forearm envelope reverses a relaxed skin triangle')

faces.astype('<u4').tofile(folder / 'fitted-indices.bin')

# Normals are recomputed from the delivered Float32 geometry, then quantized by Node.
fitted = fitted.astype('<f4')
triangles = fitted[faces].astype(float)
face_normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
double_area = np.linalg.norm(face_normals, axis=1)
if double_area.min() <= 1e-14:
    raise ValueError('The delivered skin contains a degenerate triangle')
normals = np.zeros_like(fitted, dtype=float)
for corner in range(3):
    np.add.at(normals, faces[:, corner], face_normals)
normal_lengths = np.linalg.norm(normals, axis=1)
ambiguous = normal_lengths <= 1e-12
# A few pinned source seam vertices have coincident, opposing incident faces.
# Keep their source orientation using the inverse transpose of the fitted field.
if ambiguous.any():
    source_normals = np.fromfile(folder / 'source-normals.bin', '<f4').reshape(-1, 3).astype(float)
    ids = source_indices[ambiguous]
    if (ids < 0).any(): raise ValueError('Undefined normal on a joined skin patch')
    normals[ambiguous] = np.linalg.solve(
        jacobian[ids].transpose(0, 2, 1), source_normals[ids, :, None]
    )[:, :, 0]
    normal_lengths = np.linalg.norm(normals, axis=1)
if (normal_lengths <= 1e-12).any():
    raise ValueError('The source skin contains an undefined seam normal')
normals /= normal_lengths[:, None]
fitted.tofile(folder / 'fitted-positions.bin')
normals.astype('<f4').tofile(folder / 'fitted-normals.bin')
(folder / 'registration-checks.json').write_text(json.dumps({
    'jacobianSamples': len(sample),
    'minimumSampledJacobian': float(determinants.min()),
    'nonPositiveJacobianSamples': int((determinants <= 0).sum()),
    'jacobianStage': 'Registration, clearance, posterior contour adjustment, head/neck tightening, facial/profile registration and breast envelope before mesh relaxation',
    'posteriorTightening': {
        'settings': recipe['registration'].get('posteriorTightening'),
        'affectedVertices': int((shift > 1e-8).sum()),
        'maximumForwardShiftM': float(shift.max()),
        'anteriorVerticesShifted': int(((cleared[:, 2] >= -.01) & (shift > 1e-8)).sum()),
        'scalpVerticesShifted': int(((cleared[:, 1] >= 1.49) & (shift > 1e-8)).sum()),
        'lateralVerticesShifted': int(((abs(cleared[:, 0]) >= .22) & (shift > 1e-8)).sum()),
    },
    'headNeckTightening': {
        'settings': recipe['registration'].get('headNeckTightening'),
        'affectedVertices': int((np.linalg.norm(head_neck_delta, axis=1) > 1e-8).sum()),
        'maximumLateralShiftM': float(abs(head_neck_delta[:, 0]).max()),
        'maximumCrownLoweringM': float(-head_neck_delta[:, 1].min()),
        'belowShoulderVerticesShifted': int(((head_neck_base[:, 1] <= 1.31) & (np.linalg.norm(head_neck_delta, axis=1) > 1e-8)).sum()),
        'faceVerticesShifted': int(((head_neck_base[:, 1] < 1.56) & (head_neck_base[:, 2] >= .06) & (np.linalg.norm(head_neck_delta, axis=1) > 1e-8)).sum()),
    },
    'headProfileRegistration': {
        'settings': recipe['registration'].get('headProfileRegistration'),
        'affectedVertices': int((np.linalg.norm(head_profile_delta, axis=1) > 1e-8).sum()),
        'maximumAnteriorRetractionM': float(-head_profile_delta[:, 2].min()),
        'maximumPosteriorRetractionM': float(head_profile_delta[:, 2].max()),
        'maximumNoseLoweringM': float(-head_profile_delta[:, 1].min()),
        'belowShoulderVerticesShifted': int(((head_profile_base[:, 1] <= 1.31) & (np.linalg.norm(head_profile_delta, axis=1) > 1e-8)).sum()),
    },
    'breastEnvelope': {
        'settings': recipe['registration'].get('breastEnvelope'),
        'affectedVertices': int((abs(breast_delta[:, 0]) > 1e-8).sum()),
        'maximumLateralExpansionM': float(abs(breast_delta[:, 0]).max()),
        'posteriorVerticesShifted': int(((breast_base[:, 2] <= .015) & (abs(breast_delta[:, 0]) > 1e-8)).sum()),
        'outsideChestVerticesShifted': int((((breast_base[:, 1] <= 1.10) | (breast_base[:, 1] >= 1.30)) & (abs(breast_delta[:, 0]) > 1e-8)).sum()),
    },
    'meshSmoothing': relaxation,
    'posedExtremities': extremities,
    'faceAlignment': {
        'settings': recipe['registration'].get('faceAlignment'),
        'affectedVertices': int((np.linalg.norm(face_alignment_delta, axis=1) > 1e-8).sum()),
        'maximumLoweringM': float(-face_alignment_delta[:, 1].min()),
        'crownVerticesShifted': int(((face_alignment_base[:, 1] >= 1.58) & (np.linalg.norm(face_alignment_delta, axis=1) > 1e-8)).sum()),
    },
    'forearmEnvelope': {
        'settings': recipe['registration'].get('forearmEnvelope'),
        'affectedVertices': int((abs(forearm_delta[:, 0]) > 1e-8).sum()),
        'maximumMedialExpansionM': float(abs(forearm_delta[:, 0]).max()),
        'belowWristVerticesShifted': int(((forearm_base[:, 1] <= .90) & (abs(forearm_delta[:, 0]) > 1e-8)).sum()),
        'aboveElbowVerticesShifted': int(((forearm_base[:, 1] >= 1.125) & (abs(forearm_delta[:, 0]) > 1e-8)).sum()),
        'centralTorsoVerticesShifted': int(((abs(forearm_base[:, 0]) <= .145) & (abs(forearm_delta[:, 0]) > 1e-8)).sum()),
        'stage': 'Localized envelope after mesh relaxation and posed extremity collars',
        'jacobianSamples': len(forearm_sample),
        'minimumSampledJacobian': float(forearm_determinants.min()),
        'nonPositiveJacobianSamples': int((forearm_determinants <= 0).sum()),
        'trianglesChecked': len(forearm_agreement),
        'reversedTriangles': int((forearm_agreement <= 0).sum()),
    },
    'minimumTriangleAreaM2': float(double_area.min() / 2),
    'sourceSeamNormalFallbacks': int(ambiguous.sum()),
    'surfaceAreaM2': float(double_area.sum() / 2),
    'vertices': len(fitted),
    'triangles': len(faces),
    'bounds': [fitted.min(axis=0).astype(float).tolist(), fitted.max(axis=0).astype(float).tolist()],
}, indent=2) + '\n')
