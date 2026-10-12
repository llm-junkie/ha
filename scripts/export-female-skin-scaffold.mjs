import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { femaleMorph } from "./z-anatomy-nerves.mjs";

const models = resolve("public/models"), output = resolve("work/female-skin-reference");
const atlas = JSON.parse(await readFile(resolve(models, "atlas.json")));
const morph = JSON.parse(await readFile(resolve(models, "female-fit-report.json"))).morph;
const part = atlas.parts.find((p) => p.id === "FJ2810");
const bytes = await readFile(resolve(models, basename(atlas.chunks[part.chunk].url)));
const source = new Float32Array(bytes.buffer, bytes.byteOffset + part.positions, part.vertexCount * 3);
const indices = new Uint32Array(bytes.buffer, bytes.byteOffset + part.indices, part.indexCount);
const vertices = new Float32Array(source.length);
for (let i = 0; i < source.length; i += 3) vertices.set(femaleMorph(Array.from(source.subarray(i, i + 3)), morph), i);
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "positions.bin"), Buffer.from(vertices.buffer));
await writeFile(resolve(output, "indices.bin"), Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength));
console.log(`Exported ${part.name} in the female atlas frame.`);
