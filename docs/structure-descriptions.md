# Sourced structure descriptions

Both models include offline descriptions for every selectable catalogue entry and every individually selectable mesh. The shared description catalogue covers **4,643 distinct identifiers**: **4,627 anatomical summaries** and **16 explicitly scoped model descriptions**. Coverage checks exercise all **3,645 male concepts / 2,444 meshes** and **4,462 female concepts / 2,456 meshes**. The four explorer muscle groups have separately sourced group descriptions.

Descriptions summarize available anatomical definitions, classifications, locations, connections, attachments and supply relationships. Coverage does not imply that every source provides a complete account of function, innervation or clinical anatomy. Individual sides can share an anatomical type while retaining their own model identities.

## What the detail panel shows

- **Structure description**: information matched to an anatomical term, with links under **Description sources**.
- **Model description**: information about a particular reconstruction, represented subset or source-model grouping. This avoids treating a mesh label as evidence of a complete anatomical structure or a precise nerve-root level.
- **Explorer group description**: the defined scope of a muscle search shortcut.
- **System overview (fallback)**: general system information when a new or unrecognized identity has no sourced record. A second sentence explicitly says that no sourced structure description is available. None of the currently shipped structures requires this fallback.

Description references and the existing **model source** links are separate. Descriptions, source titles and source URLs are included in the application's offline bundle. Opening an external reference still requires a connection.

## Sources and matching

The principal source is the [Foundational Model of Anatomy (FMA)](https://github.com/uw-sig/FMA), maintained by the University of Washington Structural Informatics Group. The imported OWL file reports **5.1.0**, pinned to commit `b9bcdb2035f35683c97cc8f2c6c78e4142d2c3f8`. It supplies definitions and direct anatomical relationships. The [Uberon ontology](https://github.com/obophenotype/uberon), release **2026-10-01**, supplies the native Uberon terms and cited supplemental definitions, pinned to commit `d225e8458efebec3d8df38fe936bf95fb3521d39`.

Additional references cover selected nerve branches, knee ligaments, ribs and the cervicovaginal junction. Their URLs and supporting factual summaries are retained in [description-curation.json](../data/anatomy/description-curation.json). BodyParts3D, HRA and Z-Anatomy retain credit for source-model names, sides and represented selections.

Matching uses, in order, exact FMA/UBERON identifiers, unambiguous exact labels or synonyms, reviewed aliases, and the linked source identity of a single mesh. It never selects an approximate name match. The runtime uses exact catalogue IDs, including a mesh's own concept ID when the mesh is selected directly. An unknown ID cannot acquire a different structure's description merely because their names match.

FMA often defines a class through relationships rather than a prose paragraph. The importer turns explicit assertions into short sentences and retains the supporting subject, relation and target IDs. For example, an individual ethmoidal nerve can be described through its relationship to the corresponding nasociliary nerve. **Anatomical type** text is explicitly labelled when a definition belongs to an ancestor rather than to the selected term. Nested conditional OWL restrictions are not flattened into unconditional claims, and a limited list of related structures is marked as non-exhaustive.

Reviewed aliases preserve the original model identity. For example, a represented left nerve branch may link to the anatomical type when the source has no equivalent left-specific term. The panel labels that scope rather than inventing an ontology ID. Some Z-Anatomy root labels and source-model groups receive model descriptions instead of unsupported anatomical equivalences.

## Retained evidence and regeneration

- [structure-descriptions.json](../data/anatomy/structure-descriptions.json): the compact runtime catalogue and clickable references.
- [description-evidence.json](../data/anatomy/description-evidence.json): matched terms, asserted facts, selected source excerpts and input-catalogue checksums.
- [description-sources.json](../data/anatomy/description-sources.json): pinned download URLs, sizes, SHA-256 hashes and retrieval date.
- [description-curation.json](../data/anatomy/description-curation.json): reviewed aliases, authored summaries and their references.

Regenerate with Python 3 and its standard library:

```sh
python scripts/import-structure-descriptions.py --download
node --test scripts/structure-descriptions.test.mjs
```

The full FMA and Uberon downloads remain in ignored `work/description-sources/` (about 230 MB combined). To use a different cache, pass `--source-dir <folder>`. Existing source files must match their pinned checksums; the importer rejects missing or changed sources and unresolved catalogue entries. Refresh pins deliberately when reviewing a new source release, and review changed aliases and facts before replacing the evidence.

`npm test` checks complete concept and mesh coverage, citation resolution, identifier matches, reviewed aliases, retained source assertions, ancestor applicability, model-specific scope, and explicit unknown-ID fallback behavior. Browser checks cover both models, changing selections within one system, clicking a member mesh, source links, phone layouts and fallback labels.

FMA is credited under **CC BY 4.0**; Uberon under **CC BY 3.0**. Their notices are retained in [fma-ontology.txt](../public/licenses/fma-ontology.txt) and [uberon-ontology.txt](../public/licenses/uberon-ontology.txt). See [ATTRIBUTION.md](../public/ATTRIBUTION.md) for the data and adaptation credits.
