# Z-Anatomy neural supplement

The nervous layer includes **210 additional source meshes in each model**: spinal cord white matter and gray-matter components, supporting spinal dura, spinal roots and ganglia, cauda equina, sympathetic and intercostal nerves, brachial plexus components, and detailed arm/hand and leg/foot nerves. Each model now has 356 nervous-layer meshes, including its 146 existing BodyParts3D meshes.

The existing spinal-cord concept (`FMA7647`) retains its original small canal mesh and gains four source cord-tissue surfaces. The new objects have `ZA_N…` mesh and `ZA_C…` concept identifiers derived from pinned FBX node IDs. These are local source identifiers, not invented FMA mappings. Three compound selections provide peripheral nerves/ganglia, represented brachial plexus roots/trunks/divisions, and spinal roots/cauda equina. Missing source components are not generated or implied by these selections.

The male catalogue has 2,444 meshes and 3,645 concepts; the female catalogue at the neural-import stage has 2,455 meshes and 4,461 concepts. The later [female skin supplement](female-skin.md) brings it to 2,456 meshes and 4,462 concepts. Existing mesh identities, classification corrections, and geometry are preserved. Only the spinal-cord concept's membership is extended. The supplement adds 346,530 triangles and about 4.5 MB of compressed geometry per model.

## Source and classification evidence

The source is [LluisV/Z-Anatomy at 6c7f901](https://github.com/LluisV/Z-Anatomy/tree/6c7f9016bd5899ac8edafd31b9900c151df42ed6). `NervousSystem100.fbx` supplies the actual mesh surfaces; `SkeletalSystem100.fbx` supplies registration bones. Exact file hashes, 210 allowed node IDs/names and source vertex/triangle counts are pinned in [the recipe](../data/anatomy/z-anatomy-nerves.json). Import rejects source drift before writing any assets.

Classification and identities were cross-checked on 2026-10-12 against:

- [NLM MeSH: Peripheral Nerves](https://meshb.nlm.nih.gov/record/ui?ui=D010525) and [Peripheral Nervous System](https://meshb.nlm.nih.gov/record/ui?ui=D017933), including spinal/cranial/autonomic nerves and ganglia.
- [NLM MeSH: Dura Mater](https://www.ncbi.nlm.nih.gov/mesh/D004388), supporting the viewer's existing meningeal grouping within the nervous layer.
- UAMS Department of Neuroscience tables for [upper-limb nerves](https://medicine.uams.edu/neuroscience/education/medical-school-courses/human-structure-module/anatomy-tables/nerve-tables/nerves-of-the-upper-limb/) and [lower-limb nerves](https://medicine.uams.edu/neuroscience/education/medical-school-courses/human-structure-module/anatomy-tables/nerve-tables/nerves-of-the-lower-limb/). Femoral and lateral femoral cutaneous nerves remain separate; so do radial/ulnar branches, sciatic/tibial/fibular nerves and digital branches.
- [Neuroanatomy, Spinal Cord](https://www.ncbi.nlm.nih.gov/books/NBK559056/?report=printable), for cord white/gray matter and roots. These references support names and grouping, not source geometry accuracy.

Display names translate explicit `.l` and `.r` suffixes. The source's unsuffixed “Common plantar digital branches of medial plantar nerve” is labeled right because its explicit parent is `Medial plantar nerve.r`. This naming evidence is preserved. No broad substring rule merges branches. Source courses, asymmetries and omissions remain; for example, the vagus meshes have unequal extents and the available brachial plexus surfaces are incomplete.

[PR #283 by Rayzi0417](https://github.com/ashemag/human-atlas/pull/283) was reviewed as the integration reference. The current import starts from the original FBX surfaces and does not require Blender, artificial tube radii, or resampled nerve traces.

## Registration and limits

The FBX world coordinates are centimetres and Y-up, with positive X on anatomical left. The pipeline applies the source object's full world transform and inverse-transpose normal transform; mirrored objects have their triangle winding corrected. Descendant meshes are exported separately, so they are not duplicated in their parent's surface or bounds.

A rigid, scale-preserving fit uses 41 corresponding bones: vertebrae, long bones, clavicles, pelvis and sacrum. The source geometry's proportions are retained. A trimmed nearest-vertex fit is run for 60 iterations; six matching scapula/talus/calcaneus bones are held out. The transform is pinned in the recipe. The importer independently measures up to 400 unique source vertices per bone against the current BodyParts3D mesh vertices.

Across the 47 body-fit bones, median nearest-vertex residuals range from approximately 1.6–11.1 mm; the largest per-bone 95th percentile is approximately 25.2 mm. Held-out body-fit bone 95th percentiles are approximately 12.2–16.8 mm. These sampled geometric measurements reflect differences between reference assemblies. They do not establish a nerve's correct course, tissue clearance, root level, insertion or clinical teaching accuracy. Placement is **estimated**, not validated.

The assemblies have different hand positions and foot orientations. Four additional rigid fits use 70 hand/foot bones, with 36 middle/distal finger and toe bones excluded from fitting. The feet require approximately 13–14° of local rotation; the hands mainly require a small translation. The source-identified bone mappings and transforms are pinned in the recipe, independently of the neural object names.

| Region | Male: worst bone p95 before → after | Female: worst bone p95 before → after |
| --- | ---: | ---: |
| Left hand | 21.3 → 4.4 mm | 20.0 → 4.2 mm |
| Right hand | 21.3 → 4.4 mm | 20.0 → 4.2 mm |
| Left foot | 40.2 → 3.9 mm | 38.2 → 3.7 mm |
| Right foot | 38.1 → 3.7 mm | 36.2 → 3.5 mm |

The hand/foot corrections use one continuous spatial field for every neural surface, including long parent nerves crossing the wrists/ankles. Cubic smoothstep ramps fade into the forearms/shins; hand height/lateral guards exclude trunk nerves. Complementary left/right foot weights avoid a discontinuity in the gap between the feet. All body surfaces and bones retain their original geometry. The importer measures the actual blended placement against every corresponding bone in **both delivered models** and rejects per-bone p95 distances over 5 mm or maximum distances over 10 mm. These limits detect regression in the estimated registration, rather than establishing clinical accuracy.

Simplification targets a maximum absolute meshoptimizer error of 0.1 mm per mesh, retaining source surfaces and normal seams. Shared edges longer than 10 mm are then split conformingly before either model registration. This retains the same source surface and topology in both models, while allowing the local fits and nonlinear female field to bend long source triangles without twisting them. Normals are transformed by the composed field's inverse-transpose differential. All evaluated vertex Jacobians are positive; the minima are approximately 0.835 for male and 0.564 for female. Independent grids check the transition regions, including space between the feet, for folds and boundary continuity.

After the hand/foot correction, the female adaptation follows exactly the existing non-breast body field in `female-fit-report.json`: stature, lateral/waist shaping, thorax depth and head/nose fields. The upstream glute projection is restricted to four existing muscle/vein meshes and does not apply to the neural supplement. This is an estimated fit of male reference nerves to the experimental female assembly; it is not female-specific neuroanatomy or independently reviewed pelvic nerve placement.

Full source pins, preserved base hashes, bone residuals, per-mesh errors/bounds, model totals and delivered asset hashes are in [the fit/provenance record](../public/models/z-anatomy-source.json). Automated checks cover source identities, left/right chirality, original geometry and classifications, search/layer membership, valid buffers, normal orientation, positive field determinants and deterministic reinstallation.

## Reproduce

The app and import need the existing Node dependencies only. Source files may be downloaded into the user's supplied temporary directory:

```powershell
node scripts/import-z-anatomy-nerves.mjs --source-dir D:\DEV\ha\tmp\z-anatomy --download
npm run check
npm test
npm run build
node node_modules/vite/bin/vite.js build --base=/ha/
node scripts/validate-pwa-build.mjs
```

Import reapplication retains the exact base geometry and replaces its own supplemental records/chunks, without accumulating triangles or duplicate concepts. It refreshes the delivered female catalogue hash. After regenerating/importing the base models, apply the classification overrides and ligament correction first, then rerun this import. Base identities and concepts are checksum-pinned; deliberate base changes require reviewing those pins.

To reproduce the rigid fit for review, rather than changing production data:

```powershell
node scripts/import-z-anatomy-nerves.mjs --source-dir D:\DEV\ha\tmp\z-anatomy --review-dir D:\DEV\ha\tmp\z-anatomy\review
python scripts/register-z-anatomy-nerves.py --anchors D:\DEV\ha\tmp\z-anatomy\review\anchors.json --out D:\DEV\ha\tmp\z-anatomy\review\transform.json
python scripts/register-z-anatomy-nerves.py --mode distal --anchors D:\DEV\ha\tmp\z-anatomy\review\distal-anchors.json --out D:\DEV\ha\tmp\z-anatomy\review\distal-transform.json
```

The optional fitting script needs numpy and scipy. It writes a candidate transform for review; importing always uses the pinned recipe. Source FBX files remain outside this repository.

## Attribution and licensing

**Z-Anatomy — The open source atlas of anatomy — CC-BY-SA 4.0.** Models by Gauthier Kervyn and contributors; FBX distribution by Lluís Vinent Juanico. The source also requests **BodyParts3D — The Database Center for Life Science — CC-BY-SA 2.1 Japan** for its derived content. Preserve the [original model notice](../public/licenses/z-anatomy-models.txt).

Adapted neural meshes, their records and the combined atlas catalogues are distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Base geometry assets retain their original credited licenses; application code remains MIT. See [full attribution](../public/ATTRIBUTION.md) for contributors, modifications and rendered-image credits. The bundle's separately licensed brain, inner-ear and kidney assemblies are outside this allowlist.
