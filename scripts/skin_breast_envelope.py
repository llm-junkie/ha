"""Localized lateral clearance around the retained female breast tissue."""
import numpy as np
from skin_smoothing import smoothstep


def breast_envelope_adjustment(vertices, settings):
    delta = np.zeros_like(vertices)
    if not settings:
        return delta
    x, y, z = vertices.T
    lateral = (smoothstep(*settings['lateralFadeInM'], abs(x))
               * (1 - smoothstep(*settings['lateralFadeOutM'], abs(x))))
    height = (smoothstep(*settings['heightFadeInM'], y)
              * (1 - smoothstep(*settings['heightFadeOutM'], y)))
    depth = (smoothstep(*settings['anteriorFadeInM'], z)
             * (1 - smoothstep(*settings['anteriorFadeOutM'], z)))
    delta[:, 0] = np.sign(x) * settings['lateralExpansionM'] * lateral * height * depth
    return delta
