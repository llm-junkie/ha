# Anatomy classification audit

Verified on **2026-10-12**. The review covered the assignments of all **2,234 male** and **2,245 female** meshes, including the 64 female-only HRA additions. Shared BodyParts3D identities have the same layer in both catalogues.

The audit adds **138 corrections per catalogue** (276 delivered assignments) to the two previously corrected iliotibial tracts. The override list now contains 140 verified source identities. Geometry, source names, concept IDs, and concept membership are preserved.

## Layer policy

These are mutually exclusive viewer layers, not a replacement anatomical ontology. Biological organ systems and tissue classes overlap. The viewer groups separately selectable bone organs in **Skeleton**, skeletal muscle organs and their parts in **Muscles**, and named cartilage meshes, intervertebral discs, standalone fascia, tendons, and musculoskeletal ligaments in **Connective tissue**. Papillary myocardium belongs to **Heart**. Teeth and gingiva belong to **Digestive**. Cerebral ventricles, their connecting spaces, and choroid plexuses belong to **Nervous system**.

Whole organs and their intrinsic support structures may stay together. The epiglottis stays in Respiratory; ocular tissues and the lens suspensory apparatus stay in Sensory organs; uterine/ovarian support structures stay in Reproductive; breast fat and suspensory ligaments stay in Breast tissue; digestive mesenteries stay in Digestive. The orbital common tendinous rings move to Connective tissue alongside the existing extraocular check ligaments and tendon meshes. Pineal and pituitary glands remain Endocrine. Blood vessels retain Arteries or Veins even when an organ's PART-OF concept includes them.

This policy explains choices where multiple biological classifications are defensible. It avoids describing teeth or cartilage as mineral-storing bones, cerebral fluid spaces as cardiac chambers, liver tissue as a vein, or cardiac myocardium as skeletal muscle.

## Verified corrections

Counts below apply to each catalogue. Every mesh is individually pinned by ID, name, concept ID, previous layer, corrected layer, evidence concept, and rationale group in [classification-overrides.json](../data/anatomy/classification-overrides.json).

| Structures | Meshes | Corrected layer | Cross-verification |
| --- | ---: | --- | --- |
| Fibularis brevis/longus/tertius, tibialis anterior/posterior, subscapularis, levator scapulae, tensor fasciae latae, and pharyngeal muscles | 28 | Muscles | Official muscle-organ membership; [UAMS lower-limb table](https://medicine.uams.edu/neuroscience/education/medical-school-courses/human-structure-module/anatomy-tables/muscle-tables/muscles-of-the-lower-limb/), [shoulder anatomy](https://www.ncbi.nlm.nih.gov/books/NBK534836/), [NLM pharyngeal muscles](https://meshb.nlm.nih.gov/record/ui?ui=D010609) |
| Inferior nasal conchae and lacrimal bones | 4 | Skeleton | Official bone-organ membership; [nasal cavity anatomy](https://www.ncbi.nlm.nih.gov/books/NBK544232/) |
| Nasal/laryngeal cartilage (14), costal cartilage (14), and intervertebral discs (23) | 51 | Connective tissue | Official cartilage membership; [OpenStax tissue classification](https://openstax.org/books/anatomy-and-physiology-2e/pages/4-3-connective-tissue-supports-and-protects), [disc anatomy](https://www.ncbi.nlm.nih.gov/books/NBK532964/), [NLM costal cartilage](https://www.ncbi.nlm.nih.gov/mesh/D066186), [laryngeal cartilages](https://www.ncbi.nlm.nih.gov/books/NBK553185/) |
| Teeth | 28 | Digestive | Official tooth membership; [OpenStax oral anatomy](https://openstax.org/books/anatomy-and-physiology-2e/pages/23-3-the-mouth-pharynx-and-esophagus) |
| Upper/lower gingiva | 2 | Digestive | Official gingiva membership; [oral gingiva anatomy](https://www.ncbi.nlm.nih.gov/books/NBK560662/) and OpenStax oral anatomy |
| Wrist flexor retinacula | 2 | Connective tissue | Official retinaculum membership; [wrist flexor retinaculum anatomy](https://www.ncbi.nlm.nih.gov/books/NBK545198/) |
| Common tendinous rings | 2 | Connective tissue | Official ring identity; [Kim et al. (2022), donated-cadaver histology](https://pubmed.ncbi.nlm.nih.gov/35157253/) |
| Third/fourth/lateral cerebral ventricles and interventricular foramen | 5 | Nervous system | Official cerebral identities; [Purves et al., ventricular system](https://www.ncbi.nlm.nih.gov/books/NBK11083/), [ventricular anatomy](https://www.ncbi.nlm.nih.gov/books/NBK532932/) |
| Cerebral choroid plexuses | 2 | Nervous system | Official cerebral plexus membership; the ventricular-system references above |
| Hepatovenous liver segments | 9 | Digestive | Official organ-region membership; [Gupta et al. (1981), hepatovenous liver segments](https://pubmed.ncbi.nlm.nih.gov/7319897/) |
| Ventricular papillary muscles | 5 | Heart | Official heart membership; [NLM papillary muscles](https://www.ncbi.nlm.nih.gov/mesh/68010210) |
| Iliotibial tracts (previous correction retained) | 2 | Connective tissue | Official fascia-lata membership; [Fairclough et al. (2006)](https://pubmed.ncbi.nlm.nih.gov/16533314/) |

## Evidence and maintenance

The official [BodyParts3D archive](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html) supplies IS-A and PART-OF tables. Downloaded tables were checked against the retained source concepts, and the correction families were independently corroborated with the references above. The relevant official concept-to-mesh extracts, retrieval date, and full downloaded-file SHA-256 hashes are saved in [classification-evidence.json](../data/anatomy/classification-evidence.json). These extracts are BodyParts3D data under CC BY 4.0; see [attribution](../public/ATTRIBUTION.md).

Do not infer a correction from a name substring alone. Before adding an override, cross-verify the exact source identity and anatomical type online or against a reliable anatomical source, record the evidence and rationale, and distinguish a factual error from a deliberate viewer grouping. Preserve the source ontology and geometry. Recheck both models and update this report when the scope changes.

The source converter applies the overrides. After importing and registering the female model, reapply them with:

```sh
node scripts/apply-classification-overrides.mjs
```

This validates all pinned identities and previous systems before changing assignments. The female provenance records each target layer, rationale group, references, and a SHA-256 hash of `JSON.stringify` applied to the parsed override definition, making it independent of whitespace and platform line endings. Its delivered catalogue checksum is refreshed while upstream checksums are retained.

`npm test` checks every correction's layer browsing and visibility, independent official type memberships, descriptions, atomic rejection of source drift, idempotency, catalogue provenance, and geometry integrity. The independent source membership checks also cover unchanged bones, muscles, arteries, and veins so an omitted override can still fail validation. These checks establish classification consistency with the stated policy; they do not validate the experimental female model's geometry or organ placement beyond the existing registration checks.
