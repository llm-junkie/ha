import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const corrections = JSON.parse(await readFile(new URL("../data/anatomy/classification-overrides.json", import.meta.url)));

/** Verify pinned identities before changing only the viewer's layer assignment. */
export function applyClassificationOverrides(atlas) {
  const targets = corrections.parts.map((record) => {
    const matches = atlas.parts.filter((part) => part.id === record.id);
    if (matches.length !== 1 || matches[0].name.toLowerCase() !== record.name.toLowerCase())
      throw new Error(`Classification correction has an unexpected source identity: ${record.id}`);
    const part = matches[0];
    if (![record.originalSystem, record.system].includes(part.system))
      throw new Error(`Classification correction has an unexpected source system: ${record.id}`);
    return { part, record };
  });
  let changed = 0;
  for (const { part, record } of targets) {
    if (part.system !== record.system) changed++;
    part.system = record.system;
  }
  return changed;
}

async function main() {
  const folder = new URL("../public/models/", import.meta.url);
  const manifests = await Promise.all(["atlas.json", "atlas-female.json"].map(async (name) => {
    const atlas = JSON.parse(await readFile(new URL(name, folder)));
    return { name, atlas, changed: applyClassificationOverrides(atlas) };
  }));
  const source = JSON.parse(await readFile(new URL("female-source.json", folder)));
  const femaleRecord = source.files.find((file) => (file.path ?? file.name) === "atlas-female.json");
  if (!femaleRecord) throw new Error("Missing delivered female catalogue provenance record.");
  for (const manifest of manifests) {
    manifest.bytes = Buffer.from(JSON.stringify(manifest.atlas));
    await writeFile(new URL(manifest.name, folder), manifest.bytes);
    console.log(`${manifest.name}: corrected ${manifest.changed} layer assignments; geometry unchanged.`);
  }
  const female = manifests.find((manifest) => manifest.name === "atlas-female.json");
  femaleRecord.bytes = female.bytes.length;
  femaleRecord.sha256 = createHash("sha256").update(female.bytes).digest("hex");
  source.classificationOverrides = {
    parts: corrections.parts.map((part) => part.id),
    system: "connective",
    reason: corrections.reason,
    reference: corrections.reference,
  };
  await writeFile(new URL("female-source.json", folder), JSON.stringify(source, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
