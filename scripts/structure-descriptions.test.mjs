import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { describeStructure, systemOverview } from '../app/structure-description.ts';
import { buildSearchConcepts } from '../app/anatomy-search.ts';
import { SYSTEMS } from '../app/anatomy.ts';

const read = path => readFile(new URL(`../${path}`, import.meta.url));
const json = async path => JSON.parse(await read(path));
const [catalogue, evidence, curation, pins, ...atlases] = await Promise.all([
  json('data/anatomy/structure-descriptions.json'),
  json('data/anatomy/description-evidence.json'),
  json('data/anatomy/description-curation.json'),
  json('data/anatomy/description-sources.json'),
  json('public/models/atlas.json'), json('public/models/atlas-female.json'),
]);
const canonical = id => id.replace(/^FMA:?(\d+)$/, 'FMA:$1');
const normalize = name => name.toLowerCase().replaceAll('_', ' ').replace(/\s+/g, ' ').trim();
const unsided = name => normalize(name).replace(/\b(?:right|left)\s+/g, '');

for (const [index, atlas] of atlases.entries()) {
  test(`${atlas.sex}: every selectable concept AND individual mesh has sourced information`, async () => {
    const parts = new Map(atlas.parts.map(part => [part.id, part]));
    for (const concept of atlas.concepts) {
      const result = describeStructure(concept, concept.elements.map(id => parts.get(id)));
      assert.notEqual(result.kind, 'system', `${concept.id}: ${concept.name}`);
      assert(result.text.trim().length > 0, concept.id);
      assert(result.sources.length > 0, concept.id);
      assert(!SYSTEMS.some(system => system.description === result.text), concept.id);
    }
    for (const part of atlas.parts) {
      const result = describeStructure({ id: part.id, name: part.name, elements: [part.id] }, [part]);
      assert.notEqual(result.kind, 'system', `${part.id}: ${part.name}`);
      assert(result.sources.length > 0, part.id);
      assert.equal(result.text, describeStructure({ id: part.conceptId, name: part.name, elements: [part.id] }, [part]).text);
    }
    const filename = index ? 'atlas-female.json' : 'atlas.json';
    assert.equal(createHash('sha256').update(await read(`public/models/${filename}`)).digest('hex'), evidence.catalogues[filename]);
  });
}

test('every summary retains checkable source facts and resolves all citations', () => {
  assert.deepEqual(Object.keys(catalogue.records).sort(), Object.keys(evidence.records).sort());
  for (const [id, record] of Object.entries(catalogue.records)) {
    const proof = evidence.records[id];
    assert(proof.facts.length, id);
    assert(record.citations.length, id);
    for (const citation of record.citations) {
      const source = catalogue.sources[citation];
      assert(source?.title, `${id}: ${citation}`);
      assert.equal(new URL(source.url).protocol, 'https:');
      if (/^(?:FMA|UBERON):/.test(citation)) assert(evidence.terms[citation], citation);
    }
    if (proof.method === 'identifier') assert.equal(proof.matchedTerm, canonical(id));
    if (proof.method === 'exact-name') {
      const term = evidence.terms[proof.matchedTerm];
      assert([term.name, ...term.synonyms].some(name => normalize(name) === normalize(record.name)), id);
    }
    if (proof.method === 'reviewed-alias') {
      assert.equal(curation.aliases[normalize(record.name)] ?? curation.aliases[unsided(record.name)], proof.matchedTerm, id);
    }
    for (const fact of proof.facts) {
      if (fact.relation === 'curated') {
        assert(curation.descriptions[fact.key], id);
        continue;
      }
      const term = evidence.terms[fact.subject];
      assert(term, `${id}: ${fact.subject}`);
      if (fact.relation === 'definition' || fact.relation === 'type_definition') {
        assert(term.definition, id);
      } else {
        const targets = fact.relation === 'is_a' ? term.parents : term.relations[fact.relation];
        for (const target of fact.targets) {
          assert(targets.includes(target), `${id}: ${fact.relation} ${target}`);
          assert(evidence.terms[target]?.name, target);
        }
      }
      if (fact.relation === 'type_definition') {
        const queue = [fact.appliesTo], seen = new Set();
        while (queue.length) {
          const current = queue.pop();
          if (seen.has(current)) continue;
          seen.add(current);
          queue.push(...(evidence.terms[current]?.parents ?? []));
        }
        assert(seen.has(fact.subject), `${id}: type context must belong to a real ancestor`);
      }
    }
  }
});

test('different muscles and vessels do not reuse a system overview', () => {
  const atlas = atlases[0];
  const describe = name => {
    const part = atlas.parts.find(part => part.name.toLowerCase() === name.toLowerCase());
    assert(part, name);
    return describeStructure({ id: part.id, name: part.name, elements: [part.id] }, [part]);
  };
  const tibialis = describe('Left tibialis anterior');
  const rectus = describe('Left rectus femoris');
  assert.notEqual(tibialis.text, rectus.text);
  assert.match(tibialis.text, /anterior compartment of left leg/i);
  assert.match(tibialis.text, /nerve to left tibialis anterior/i);
  const nerve = describe('Left anterior ethmoidal nerve');
  assert.match(nerve.text, /left nasociliary nerve/i);
});

test('previously corrected anatomy retains useful structure-specific facts', () => {
  const records = catalogue.records;
  for (const [id, expected] of [
    ['FMA58776', /deep fascia/],
    ['FMA78450', /cerebrospinal-fluid space/i],
    ['FMA78454', /cerebrospinal-fluid space/i],
    ['FMA78469', /cerebrospinal-fluid space/i],
    ['FMA75351', /third ventricle/],
    ['FMA61934', /produces cerebrospinal fluid/],
    ['FMA40121', /carpal tunnel/],
    ['FMA49073', /rectus muscles of the eye/],
    ['FMA55704', /molar tooth/],
    ['FMA59763', /gum tissue/],
    ['FMA15747', /liver/i],
    ['FMA25058', /intervertebral disk/],
    ['FMA55099', /laryngeal cartilage/],
    ['FMA7260', /tricuspid valve/],
  ]) assert.match(records[id].text, expected, id);
});

test('an unknown identity is clearly labelled as a fallback even if its name matches', () => {
  const part = { id: 'new-mesh', conceptId: 'new-concept', name: 'Heart', system: 'cardiac' };
  const result = describeStructure({ id: part.id, name: part.name, elements: [part.id] }, [part]);
  assert.equal(result.kind, 'system');
  assert.equal(result.label, 'System overview (fallback)');
  assert.match(result.note, /No sourced description is available/);
  assert.equal(result.text, SYSTEMS.find(system => system.id === 'cardiac').description);
  assert.deepEqual(result.sources, []);
  for (const system of SYSTEMS) assert.equal(systemOverview(system.id).kind, 'system');
});

test('saved multi-piece selections and explorer groups retain their own scope', () => {
  const parts = atlases[0].parts.slice(0, 2);
  const selection = { id: parts[0].id, name: 'Selected structures', elements: parts.map(part => part.id) };
  const result = describeStructure(selection, parts);
  assert.equal(result.label, 'Saved selection');
  assert.match(result.text, /2 selected pieces/);
  const group = buildSearchConcepts(atlases[0]).find(concept => concept.searchGroup);
  const description = describeStructure(group, atlases[0].parts.filter(part => group.elements.includes(part.id)));
  assert.equal(description.kind, 'group');
  assert.equal(description.text, group.searchGroup.description);
  assert.match(description.sources[0].url, /medicine\.uams\.edu/);
});

test('source downloads are pinned and ontology notices are retained', async () => {
  for (const pin of pins.files) {
    assert.match(pin.sha256, /^[a-f0-9]{64}$/);
    assert(pin.bytes > 0);
    assert.equal(new URL(pin.url).protocol, 'https:');
  }
  for (const [name, pinName] of [['fma', 'fma-license.txt'], ['uberon', 'uberon-license.txt']]) {
    const pin = pins.files.find(pin => pin.name === pinName);
    // Git may check text files out with CRLF on Windows; verify notice content.
    const notice = (await read(`public/licenses/${name}-ontology.txt`)).toString().replaceAll('\r\n', '\n');
    assert.equal(createHash('sha256').update(notice).digest('hex'), pin.sha256);
  }
});
