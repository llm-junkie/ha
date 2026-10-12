"""Localized depth registration of the source face, throat and posterior scalp."""
import numpy as np
from scipy.interpolate import PchipInterpolator
from skin_smoothing import smoothstep


def head_profile_adjustment(vertices, settings):
    delta = np.zeros_like(vertices)
    if not settings:
        return delta
    x, y, z = vertices.T
    height = np.array(settings['anteriorHeightsM'])
    depth = PchipInterpolator(height, settings['anteriorRetractionM'])(np.clip(y, height[0], height[-1]))
    neck = 1 - smoothstep(*settings['neckWidthFadeM'], abs(x))
    face = 1 - smoothstep(*settings['faceWidthFadeM'], abs(x))
    face_blend = smoothstep(*settings['faceHeightBlendM'], y)
    anterior = smoothstep(*settings['anteriorDepthFadeM'], z)
    weight = ((1 - face_blend) * neck + face_blend * face) * anterior
    delta[:, 2] = -depth * weight
    nose = np.exp(-.5 * ((y - settings['noseHeightM']) / settings['noseHeightSigmaM']) ** 2)
    nose *= (1 - smoothstep(*settings['noseWidthFadeM'], abs(x))) * anterior
    delta[:, 1] = -settings['noseLoweringM'] * nose
    posterior = (smoothstep(*settings['posteriorHeightFadeInM'], y)
                 * (1 - smoothstep(*settings['posteriorHeightFadeOutM'], y))
                 * (1 - smoothstep(*settings['posteriorDepthFadeM'], z))
                 * (1 - smoothstep(*settings['posteriorWidthFadeM'], abs(x))))
    posterior *= np.exp(-.5 * ((y - settings['posteriorHeightM']) / settings['posteriorHeightSigmaM']) ** 2)
    delta[:, 2] += settings['posteriorRetractionM'] * posterior
    return delta


def face_alignment_adjustment(vertices, settings):
    delta = np.zeros_like(vertices)
    if not settings: return delta
    x, y, z = vertices.T
    heights = np.array(settings['heightsM'])
    lowering = PchipInterpolator(heights, settings['loweringM'])(np.clip(y, heights[0], heights[-1]))
    anterior = smoothstep(*settings['anteriorDepthFadeM'], z)
    lateral = 1 - smoothstep(*settings['faceWidthFadeM'], abs(x))
    delta[:, 1] = -lowering * anterior * lateral
    ear = (smoothstep(*settings['earWidthFadeM'], abs(x))
           * smoothstep(*settings['earHeightFadeInM'], y)
           * (1 - smoothstep(*settings['earHeightFadeOutM'], y))
           * smoothstep(*settings['earDepthFadeInM'], z)
           * (1 - smoothstep(*settings['earDepthFadeOutM'], z)))
    delta[:, 1] -= settings['earLoweringM'] * ear
    delta[:, 2] = settings['earForwardM'] * ear
    delta[:, 0] = np.sign(x) * settings['earOutwardM'] * ear
    return delta
