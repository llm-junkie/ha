import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const checkout = process.argv[2];
if (!checkout)
  throw new Error(
    "Provide a local Anatolume checkout: node scripts/import-female-model.mjs <checkout>",
  );
const revision = "39f2c018205faa756ab59b4b12fdf0d1295cfdaf";
const root = resolve(checkout),
  folder = new URL("../public/models/", import.meta.url);
const read = (path) =>
  execFileSync("git", ["show", `${revision}:public/models/${path}`], {
    cwd: root,
    maxBuffer: 100 * 1024 * 1024,
  });
const source = JSON.parse(read("female-source.json"));
for (const file of source.files) {
  const path = file.path ?? file.name;
  if (
    !/^(atlas-female\.json|female-fit-report\.json|female-(base-\d+|joint-additions-[a-f\d]+)\.bin\.gz)$/.test(
      path,
    )
  )
    throw new Error("Unexpected source asset path.");
  const bytes = read(path);
  if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
    throw new Error(`Source checksum mismatch: ${path}`);
  await writeFile(new URL(path, folder), bytes);
}
source.importedVia = { repository: "https://github.com/isunky/Anatolume", revision };
await writeFile(new URL("female-source.json", folder), JSON.stringify(source, null, 2));
console.log(
  `Imported ${source.files.length} checksum-verified files from Anatolume ${revision.slice(0, 7)}.`,
);
