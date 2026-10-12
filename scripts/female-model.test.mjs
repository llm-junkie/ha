import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  readModel,
  MODEL_STORAGE_KEY,
  isModelAtlas,
  defaultLayers,
} from "../app/model-catalogue.ts";
import {
  captureSavedView,
  normalizeSavedView,
  shareViewUrl,
  readViewHash,
  viewModelFromHash,
  readBookmarks,
  writeBookmarks,
  savedViewsKey,
  viewHash,
} from "../app/saved-views.ts";
import { readRecentStructures, recentStructuresKey } from "../app/recent-structures.ts";
import { buildSearchConcepts, matchesAnatomySearch } from "../app/anatomy-search.ts";
import { partIsVisible } from "../app/part-visibility.ts";
const load = (filename) =>
  readFile(new URL(`../public/models/${filename}`, import.meta.url)).then(JSON.parse);
const [male, female] = await Promise.all(["atlas.json", "atlas-female.json"].map(load));
const storage = () => {
  const items = new Map();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, v) };
};

test("model choice honors links and query, remembers preferences, and tolerates unavailable storage", () => {
  const saved = storage();
  saved.setItem(MODEL_STORAGE_KEY, "female");
  assert.equal(readModel(saved), "female");
  assert.equal(readModel(saved, "?model=male"), "male");
  assert.equal(readModel(saved, "?model=female", "male"), "male");
  assert.equal(
    readModel({
      getItem() {
        throw Error("blocked");
      },
    }),
    "male",
  );
  assert(isModelAtlas(female, "female"));
  assert(!isModelAtlas(male, "female"));
  assert(!isModelAtlas({}, "male"));
  assert(defaultLayers("female", female).includes("mammary"));
  assert(!defaultLayers("male", male).includes("mammary"));
  assert(defaultLayers("male", male).includes("integumentary"));
  assert(defaultLayers("female", female).includes("integumentary"));
});

test("female anatomy search and layer visibility keep reproductive and breast structures independent", () => {
  const concepts = buildSearchConcepts(female);
  for (const term of ["uterus", "uterosacral", "ovary", "hamstrings", "quads"])
    assert(
      concepts.some((c) => matchesAnatomySearch(c, term)),
      term,
    );
  for (const id of ["VH_F_right_uterosacral_ligament", "VH_F_left_uterosacral_ligament"]) {
    const part = female.parts.find((p) => p.id === id);
    assert(part);
    assert.equal(part.system, "reproductive");
    assert(partIsVisible(part, { visible: ["reproductive"], selected: [], isolate: false }));
    assert(!partIsVisible(part, { visible: ["mammary"], selected: [], isolate: false }));
  }
  assert(female.parts.filter((p) => p.system === "mammary").length > 0);
  assert(
    !female.parts.some((p) => p.system === "reproductive" && /testis|prostate|penis/i.test(p.name)),
  );
});

test("female share links, histories and bookmarks never restore onto the male atlas or overwrite legacy views", () => {
  const selected = ["VH_F_left_uterosacral_ligament"];
  const view = captureSavedView(
    {
      visible: ["reproductive", "mammary"],
      selected,
      isolate: true,
      inspectorOpen: true,
      explode: 0,
      view: "side",
      rotate: false,
      reset: 0,
    },
    { position: [1, 1, 0], target: [0, 0.85, 0], offset: [0, 0] },
    selected[0],
    "female",
  );
  const url = new URL(shareViewUrl("https://example.github.io/ha/?test=1", view));
  assert.equal(url.pathname, "/ha/");
  assert.equal(url.searchParams.get("model"), "female");
  assert.equal(viewModelFromHash(url.hash), "female");
  assert.deepEqual(readViewHash(url.hash, female), view);
  assert.equal(normalizeSavedView(view, male), null);
  const old = { ...view };
  delete old.model;
  assert.equal(viewModelFromHash(viewHash(old)), "male");
  assert.equal(normalizeSavedView(old, female), null);
  const saved = storage();
  saved.setItem(savedViewsKey("male"), '[{"legacy":true}]');
  const legacy = saved.getItem(savedViewsKey("male"));
  writeBookmarks(saved, [{ id: "female", name: "Female pelvis", view }], "female");
  assert.equal(readBookmarks(saved, female)[0].view.model, "female");
  assert.equal(saved.getItem(savedViewsKey("male")), legacy);
  saved.setItem(recentStructuresKey("male"), '["FJ3152"]');
  saved.setItem(recentStructuresKey("female"), JSON.stringify(selected));
  assert.deepEqual(readRecentStructures(saved), ["FJ3152"]);
  assert.deepEqual(readRecentStructures(saved, "female"), selected);
});
