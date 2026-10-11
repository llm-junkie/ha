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

The model retains 2,181 reshaped BodyParts3D meshes and adds 64 HRA source meshes: 8 pelvic bones, 38 reproductive structures, 16 breast structures, and 2 knee ligaments. Pelvic and reproductive placements use separate recorded bounding-box fits; non-breast anatomy follows a shared estimated body morph. Original HRA breasts receive a separate estimated contour and placement. Geometry is simplified and normals quantized. There are 2,245 selectable meshes and 4,248 named concepts; breast tissue and optional nipple/areolar surfaces have separate layers.

Local adaptation: the bilateral uterosacral source surfaces are tessellated on 0.25 mm depth intervals before joining the recorded reproductive and pelvic registrations with a monotone, C1 depth map. New vertices are welded only within Float32 precision. The cervicovaginal cap retains its imported geometry; the posterior cap follows the same transform as the HRA pelvis. No source surface is cut away or hidden. Every other imported geometry chunk remains unchanged. The correction and quantitative checks are recorded in `models/female-ligament-fit-report.json` and [the model notes](https://github.com/llm-junkie/ha/blob/main/docs/female-model.md).

This is an experimental derived assembly with estimated proportions and unreviewed organ placement. The musculature derives from the male reference. Female external skin/genital surfaces and validated urethra/pelvic-floor replacements remain incomplete. Registration checks establish geometric consistency with the HRA source assembly; they do not independently validate its attachment anatomy.

## Screenshots, comparison figures, and retained source fixtures

The README's male/female screenshots and the uterosacral comparison figure render adaptations of the datasets credited above. The source fixture in `data/anatomy/uterosacral-source.json` retains HRA-derived geometry and registration references under the same dataset attribution. Preserve the relevant BodyParts3D/HRA credits, link CC BY 4.0, and identify adaptations when redistributing these data or anatomy images. The application code's MIT license and copyright notice remain separate from the anatomy data license.
