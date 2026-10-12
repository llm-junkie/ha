"""Smooth medial clearance over both forearms in the retained atlas pose."""
import numpy as np
from skin_smoothing import smoothstep


def forearm_envelope_adjustment(vertices, settings):
    delta = np.zeros_like(vertices)
    if not settings:
        return delta
    x, y, z = vertices.T
    height = (smoothstep(*settings['heightFadeInM'], y)
              * (1 - smoothstep(*settings['heightFadeOutM'], y)))
    axis = np.interp(y, settings['axisHeightsM'], settings['axisAbsXM'])
    distance = abs(x) - axis
    medial = (smoothstep(*settings['innerDistanceFadeInM'], distance)
              * (1 - smoothstep(*settings['outerDistanceFadeOutM'], distance)))
    lateral = smoothstep(*settings['minimumLateralFadeM'], abs(x))
    depth = (smoothstep(*settings['posteriorFadeInM'], z)
             * (1 - smoothstep(*settings['anteriorFadeOutM'], z)))
    delta[:, 0] = -np.sign(x) * settings['medialExpansionM'] * height * medial * lateral * depth
    return delta
