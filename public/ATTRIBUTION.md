# Project and anatomy attribution

## Application and fork contributions

Human Atlas was created by **Ashe Magalhaes ([ashemag/human-atlas](https://github.com/ashemag/human-atlas))**. Application code is MIT licensed; this fork retains the original `Copyright (c) 2026 ashemag` notice in [LICENSE](https://github.com/llm-junkie/ha/blob/main/LICENSE).

- **isunky / Anatolume:** rendering performance and navigation improvements from [3cef53d](https://github.com/isunky/Anatolume/tree/3cef53da908c902f13bd48c10cd6365de162c150); the female package was imported from [39f2c01](https://github.com/isunky/Anatolume/tree/39f2c018205faa756ab59b4b12fdf0d1295cfdaf).
- **wiiiimm / Human Atlas:** cursor-centred zoom and muscle-group search from [9c1dd3d](https://github.com/wiiiimm/human-atlas/tree/9c1dd3d222a54844c1a8b54870663ce63b9d53b0); also the fork foundation for Human Atlas Enhanced.
- **PrejudiceNeutrino / Human Atlas Enhanced:** the experimental female assembly, HRA integration, body/breast adaptations, and fit records from [9e0d710](https://github.com/PrejudiceNeutrino/human-atlas-enhanced/tree/9e0d710fcc1d467dc758d61d6f417231cb1472fe).

Human Atlas Enhanced credits [Female Atlas by Mahendra Beniwal](https://github.com/HiMahendraBeniwal/female-atlas/tree/b0a20fa3a009ca5f6bfa07b7479312e04c862af2) as an inspiration for the breast presentation in its derived female model. The packaged geometry uses HRA source assets.

Local additions include GitHub Pages deployment, updated dependencies, saved views, layer opacity, PWA installation and update support, separate model histories/bookmarks, and the bilateral uterosacral registration correction documented below. Third-party application dependencies retain their respective licenses.

## BodyParts3D male reference

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.

- License: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html (updated 2025-02-27)
- Dataset: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- License terms: https://creativecommons.org/licenses/by/4.0/
- Source geometry: `isa_BP3D_4.0_obj_99.zip`, BodyParts3D 4.0.
- English names and relationships: IS-A and PART-OF concept, element, and inclusion tables from the same archive.
- Publication: Mitsuhashi et al. (2009), BodyParts3D: 3D structure database for anatomical concepts. https://doi.org/10.1093/nar/gkn613

Adaptations: axes and units converted from millimeters/Z-up to meters/Y-up; translated to rest at the stage; geometry simplified using meshoptimizer with 0.2% relative error limit per structure; normals quantized to signed 16-bit; packed into binary chunks; curated display system groupings and colors. The source contains 2,234 individual OBJ meshes; all remain represented. The combined hierarchy contains 3,432 named FMA concepts, which may reference multiple meshes. Original source identity is preserved in the manifest.

Source OBJ comments mention an older CC BY-SA 2.1 Japan license. The official current database license linked above supersedes that legacy text and explicitly permits redistribution and adaptation under CC BY 4.0.

BodyParts3D represents an adult male reference anatomy based on TARO MRI and anatomical illustration refinements. It is not a complete model of every possible human anatomical structure or variation. This interface is educational and is not a clinical tool.

## Female experimental study model

Female reference anatomy: **Kristen Browne and Heidi Schlehlein**, *3D Reference Organ Set for United, Female, v1.5* (2023), Human Reference Atlas, published by HuBMAP. CC BY 4.0.

- Source DOI: https://doi.org/10.48539/HBM352.BTSQ.586
- Dataset record: https://entity.api.hubmapconsortium.org/redirect/HBM352.BTSQ.586
- Registered citation and license metadata: https://api.datacite.org/dois/10.48539/HBM352.BTSQ.586
- Original GLB: https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.5/assets/3d-vh-f-united.glb
- License: https://creativecommons.org/licenses/by/4.0/

The derived study model was adapted by [PrejudiceNeutrino / Human Atlas Enhanced](https://github.com/PrejudiceNeutrino/human-atlas-enhanced/tree/9e0d710fcc1d467dc758d61d6f417231cb1472fe), based on wiiiimm / Human Atlas. It was imported through [isunky / Anatolume](https://github.com/isunky/Anatolume/tree/39f2c018205faa756ab59b4b12fdf0d1295cfdaf). Exact source revisions, asset hashes, and local changes are recorded in `models/female-source.json`.

The imported model retains 2,181 reshaped BodyParts3D meshes and adds 64 HRA source meshes: 8 pelvic bones, 38 reproductive structures, 16 breast structures, and 2 knee ligaments. Pelvic and reproductive placements use separate recorded bounding-box fits; non-breast anatomy follows a shared estimated body morph. Original HRA breasts receive a separate estimated contour and placement. Geometry is simplified and normals quantized. This imported assembly has 2,245 selectable meshes and 4,248 named concepts; the neural supplement below adds 210 meshes and 213 concepts. Breast tissue and optional nipple/areolar surfaces have separate layers.

Local adaptation: the bilateral uterosacral source surfaces are tessellated on 0.25 mm depth intervals before joining the recorded reproductive and pelvic registrations with a monotone, C1 depth map. New vertices are welded only within Float32 precision. The cervicovaginal cap retains its imported geometry; the posterior cap follows the same transform as the HRA pelvis. No source surface is cut away or hidden. Every other imported geometry chunk remains unchanged. The correction and quantitative checks are recorded in `models/female-ligament-fit-report.json` and [the model notes](https://github.com/llm-junkie/ha/blob/main/docs/female-model.md).

This is an experimental derived assembly with estimated proportions and unreviewed organ placement. The musculature derives from the male reference. The female skin supplement below supplies the external body surface; detailed external genital anatomy and validated urethra/pelvic-floor replacements remain incomplete. Registration checks establish geometric consistency with the HRA source assembly; they do not independently validate its attachment anatomy.

### Female skin supplement

**Human Reference Atlas / HuBMAP, Kristen Browne and contributors — HuBMAP CCF 3D Reference Object Library v1.3**, `VH_F_skin` / skin of body, UBERON:0002097. [Source file at the pinned revision](https://github.com/hubmapconsortium/ccf-releases/blob/b036a91aaf7234f462b1249d4a5f4fb0e982f412/v1.3/models/3d-vh-f-skin.glb), [reference library and license statement](https://humanatlas.io/3d-reference-library). License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Local adaptation: source skin simplified to 84,180 triangles with a 0.2 mm absolute error target, then fitted to the derived female body's outer shape and installed breast envelope using a continuous global radial basis field. Local adjustments refine the upper back, neck, scalp, face, ears and lateral breast clearance. Distance-weighted Taubin relaxation softens local contours with protected details, bounded movement and triangle orientation checks. Posed external hand/foot patches from **BodyParts3D FJ2810 Skin**, under the same CC BY 4.0 license credited above, are transformed by the existing female body morph and joined at wrist/ankle collars. A final localized medial forearm envelope covers retained muscle and vein surfaces while preserving the joined wrist/ankle geometry; its field and every joined triangle are checked. The resulting skin has 73,992 triangles; no genital geometry from the male reference is included. Normals are recomputed after joining, preserving the orientation of ambiguous HRA seams. Existing anatomy meshes are preserved. The source, controls, patch/reference hashes and delivered measurements are recorded in `data/anatomy/female-skin.json`, `data/anatomy/female-skin-extremities.npz` and `models/female-skin-source.json`; see [the skin fit notes](https://github.com/llm-junkie/ha/blob/main/docs/female-skin.md). The final female catalogue contains 2,456 meshes and 4,462 concepts. The fit remains experimental and is not independently validated anatomy.

## Z-Anatomy neural supplement

**Z-Anatomy — The open source atlas of anatomy — CC-BY-SA 4.0.** Models by **Gauthier Kervyn and contributors**; Blender template by Gauthier Kervyn and Marcin Zielinski. FBX distribution and Unity project by **Lluís Vinent Juanico**, [LluisV/Z-Anatomy](https://github.com/LluisV/Z-Anatomy/tree/6c7f9016bd5899ac8edafd31b9900c151df42ed6).

The upstream model notice also requests this attribution: **BodyParts3D — The Database Center for Life Science — CC-BY-SA 2.1 Japan**. This is retained for the Z-Anatomy-derived content; the separately imported BodyParts3D 4.0 source meshes use the current official CC BY 4.0 license above.

- Source revision: `6c7f9016bd5899ac8edafd31b9900c151df42ed6`, `Resources/Models/FBX/NervousSystem100.fbx`; registration bones from `SkeletalSystem100.fbx`.
- Original model notice: [z-anatomy-models.txt](licenses/z-anatomy-models.txt), preserved from `Resources/Models/License.txt`.
- Terms: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- Source hashes, exact object names, side-label evidence, and anatomical references: `data/anatomy/z-anatomy-nerves.json`.
- Delivered assets, adaptation measurements and hashes: `models/z-anatomy-source.json`; geometry: `models/z-nerves-male-*.bin[.gz]` and `models/z-nerves-female-*.bin[.gz]`.

Adaptations: 210 selected source mesh surfaces are converted from centimetres to metres, rigidly registered against corresponding BodyParts3D bones, simplified with a maximum 0.1 mm meshoptimizer error target, tessellated to 10 mm maximum source edges, and packed with quantized normals. Four further bone-fitted hand/foot transforms blend smoothly into forearms/shins, aligning the assemblies' differing hand positions and foot orientations. Normals follow the inverse-transpose differential of the composed field. Side suffixes become readable labels; one unsuffixed right-foot mesh inherits its side from its explicit source parent. Source identifiers and names remain in provenance. The female supplement follows the assembly's existing estimated body morph after the hand/foot correction. Original BodyParts3D and HRA mesh geometry and the verified classifications remain unchanged.

The supplement includes spinal cord tissue, supporting spinal dura, spinal roots and ganglia, cauda equina, sympathetic/intercostal nerves, brachial plexus components, and separately named arm/hand and leg/foot nerves. Four cord tissue meshes extend the existing spinal-cord concept, retaining its original canal membership. The combined male catalogue has 2,444 meshes and 3,645 concepts; the female catalogue after the neural import has 2,455 meshes and 4,461 concepts, before adding the fitted skin.

**The adapted neural data, its catalogue records, and the combined atlas catalogues are distributed under CC BY-SA 4.0.** Original geometry assets retain their credited source licenses; application code remains MIT. Retain these credits, identify adaptations, and apply share-alike to redistributed adaptations of the Z-Anatomy data and combined catalogues. Rendered images containing the supplement also require the Z-Anatomy attribution and applicable CC BY-SA terms. Historical screenshots made before this supplement retain the source credits applicable when captured.

The source bundle also lists third-party brain, cranial-nerve, inner-ear and kidney assets with separate licenses. It credits **University of Dundee, CAHID — Cranial Nerves and Foramina — CC-BY 4.0**; that upstream credit is retained for the selected vagus/accessory nerve surfaces. This import is restricted to the reviewed neural object allowlist; it does not import the brain, ear or kidney assemblies. The [model notes](https://github.com/llm-junkie/ha/blob/main/docs/z-anatomy-nerves.md) document its scope and measured registration limits. It is not a complete nervous system or independently validated anatomy.

[Rayzi0417's PR #283](https://github.com/ashemag/human-atlas/pull/283) supplied the integration reference. This fork uses a new import from the pinned FBX surfaces, with separate branch identities, both model registrations, and reproducible source checks.

## Iliotibial tract classification

Both atlases assign the right (`FJ1423`, `FMA58776`) and left (`FJ1423M`, `FMA58777`) iliotibial tracts to **Connective tissue**. BodyParts3D's retained concepts link these meshes to fascia lata. [Fairclough et al. (2006)](https://pmc.ncbi.nlm.nih.gov/articles/PMC2100245/) supports their identification as deep fascia and the structure-specific description. This corrects the viewer's Skeleton assignment; mesh geometry, source identifiers, and concept membership are preserved.

The reproducible overrides are in `data/anatomy/classification-overrides.json`. The source converter applies them, and `node scripts/apply-classification-overrides.mjs` reapplies them after a female import and registration, updating the delivered catalogue checksum while retaining upstream checksums.

## Catalogue classification audit

The [classification audit](https://github.com/llm-junkie/ha/blob/main/docs/anatomy-classification.md) documents 138 additional layer corrections in each catalogue, with the viewer policy and corroborating medical references. The 140 pinned BodyParts3D identities now include the previously corrected iliotibial tracts. Mesh geometry and the original source ontology remain unchanged.

`data/anatomy/classification-evidence.json` contains selected official BodyParts3D IS-A/PART-OF concept-to-mesh relationships downloaded on 2026-10-12, with source URLs and full-table SHA-256 hashes. These retained extracts share the BodyParts3D attribution and CC BY 4.0 license above. `data/anatomy/classification-overrides.json` records each corrected system, exact identity, evidence concept, rationale, and independent references. The female provenance records mixed target systems and a hash of this definition.

## Screenshots, comparison figures, and retained source fixtures

The README's male/female screenshots and the uterosacral comparison figure render adaptations of the datasets credited above. The source fixture in `data/anatomy/uterosacral-source.json` retains HRA-derived geometry and registration references under the same dataset attribution. Preserve the relevant BodyParts3D/HRA credits, link CC BY 4.0, and identify adaptations when redistributing these data or anatomy images. The application code's MIT license and copyright notice remain separate from the anatomy data license.
