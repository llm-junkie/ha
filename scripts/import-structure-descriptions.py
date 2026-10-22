"""Build offline anatomical summaries from pinned, identifier-matched source facts.

Python standard library only. Full ontologies stay in ignored work/. The retained
evidence contains only the source terms actually used. No approximate name matches
or spatial/model-geometry guesses are used to infer anatomical relationships.
"""
import argparse
import collections
import hashlib
import json
import re
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/anatomy'
NS = {'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
      'owl': 'http://www.w3.org/2002/07/owl#', 'fma': 'http://purl.org/sig/ont/fma/'}
RDF = '{http://www.w3.org/1999/02/22-rdf-syntax-ns#}'


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize(name):
    return ' '.join(name.casefold().replace('_', ' ').split())


def unsided(name):
    return ' '.join(re.sub(r'\b(?:right|left)\s+', '', normalize(name)).split())


def canonical(id):
    return re.sub(r'^FMA:?(\d+)$', r'FMA:\1', id)


def parse_fma(path):
    terms, depth = {}, 0
    for event, el in ET.iterparse(path, events=('start', 'end')):
        if event == 'start':
            depth += 1
            continue
        if depth == 2:
            match = re.fullmatch(r'http://purl.org/sig/ont/fma/fma(\d+)', el.get(RDF + 'about', ''))
            if el.tag == '{' + NS['owl'] + '}Class' and match:
                id = 'FMA:' + str(int(match[1]))
                term = {'id': id, 'iri': el.get(RDF + 'about'),
                        'name': ' '.join((el.findtext('rdfs:label', namespaces=NS) or '').split()),
                        'definition': el.findtext('fma:definition', namespaces=NS),
                        'parents': [], 'relations': {},
                        'synonyms': [s.text for s in el.findall('fma:synonym', NS) if s.text]}
                # Only direct restrictions: nested attributed/conditional restrictions
                # are NOT flattened into unconditional anatomical claims.
                for sub in el.findall('rdfs:subClassOf', NS):
                    parent = sub.get(RDF + 'resource')
                    if parent:
                        term['parents'].append(parent)
                    restriction = sub.find('owl:Restriction', NS)
                    if restriction is not None:
                        prop = restriction.find('owl:onProperty', NS)
                        target = restriction.find('owl:someValuesFrom', NS)
                        if prop is not None and target is not None and target.get(RDF + 'resource'):
                            key = prop.get(RDF + 'resource').rsplit('/', 1)[-1]
                            term['relations'].setdefault(key, []).append(target.get(RDF + 'resource'))
                terms[id] = term
            el.clear()
        depth -= 1
    by_iri = {t['iri']: t['id'] for t in terms.values()}
    for term in terms.values():
        term['parents'] = [by_iri[p] for p in term['parents'] if p in by_iri]
        term['relations'] = {r: [by_iri[p] for p in ids if p in by_iri]
                             for r, ids in term['relations'].items()}
    return terms


def parse_uberon(path):
    terms = {}
    for stanza in path.read_text(encoding='utf-8').split('\n[Term]\n')[1:]:
        stanza = stanza.split('\n[', 1)[0]

        def field(key):
            match = re.search('^' + re.escape(key) + r': (.*)$', stanza, re.M)
            return match[1] if match else None

        if field('is_obsolete') == 'true' or not field('id').startswith('UBERON:'):
            continue
        id = field('id')
        definition = re.search(r'^def: "((?:\\.|[^"\\])*)"', stanza, re.M)
        terms[id] = {'id': id, 'iri': 'http://purl.obolibrary.org/obo/' + id.replace(':', '_'),
                     'name': field('name'),
                     'definition': definition[1].replace('\\"', '"').replace('\\n', ' ') if definition else None,
                     'parents': re.findall(r'^is_a: (\S+)', stanza, re.M), 'relations': {},
                     'synonyms': re.findall(r'^synonym: "((?:\\.|[^"\\])*)" EXACT', stanza, re.M)}
    return terms


# Translate only relations whose semantics support these statements. No supply,
# attachment, or function is inferred from a structure's name or screen position.
RELATIONS = [
    ('branch_of', 'It branches from'),
    ('tributary_of', 'It is a tributary of'),
    ('regional_part_of', 'It is a regional part of'),
    ('constitutional_part_of', 'It forms part of'),
    ('contained_in', 'It is contained in'),
    ('has_origin', 'Its origin is on'),
    ('has_insertion', 'Its insertion is on'),
    ('nerve_supply', 'Its nerve supply includes'),
    ('arterial_supply', 'Its arterial supply includes'),
    ('venous_drainage', 'Its venous drainage includes'),
    ('arterial_supply_of', 'It supplies blood to'),
    ('nerve_supply_of', 'It provides nerve supply to'),
    ('drains_into', 'It drains into'),
    ('continuous_with', 'It is continuous with'),
    ('member_of', 'It belongs to'),
]


def sentence(text):
    text = ' '.join(text.split()).strip()
    return text.rstrip('.') + '.'


def definition_text(text):
    # Omit ontology authoring examples and superseded definitions from the UI.
    text = re.split(r'\b(?:Examples?|Eaxmple|Old definition):', text, maxsplit=1)[0]
    return sentence(text.replace('vetricle', 'ventricle').replace('venricle', 'ventricle'))


def describe(term, all_terms):
    facts, used, sentences = [], {term['id']}, []
    if term['definition']:
        sentences.append(definition_text(term['definition']))
        facts.append({'subject': term['id'], 'relation': 'definition'})
    elif term['parents']:
        parents = [id for id in term['parents'] if id in all_terms and all_terms[id]['name']]
        if parents:
            parent = all_terms[parents[0]]
            label = parent['name']
            article = 'an' if label[0].lower() in 'aeiou' else 'a'
            sentences.append(f"{term['name']} is {article} {label[0].lower() + label[1:]}.")
            facts.append({'subject': term['id'], 'relation': 'is_a', 'targets': [parent['id']]})
            used.add(parent['id'])
    for relation, phrase in RELATIONS:
        targets = list(dict.fromkeys(id for id in term['relations'].get(relation, [])
                                    if id in all_terms and all_terms[id]['name'] and
                                    not re.search(r'of (?:male|female) human body', all_terms[id]['name'], re.I)))
        if not targets:
            continue
        # An explicitly non-exhaustive list avoids presenting a truncated set as
        # the whole supply or membership. Preserve all targets in the evidence.
        picked = targets[:3]
        names = [all_terms[id]['name'] for id in picked]
        joined = ', '.join(names[:-1]) + ' and ' + names[-1] if len(names) > 1 else names[0]
        suffix = ', among other structures' if len(targets) > len(picked) else ''
        sentences.append(f'{phrase} {joined}{suffix}.')
        facts.append({'subject': term['id'], 'relation': relation, 'targets': picked})
        used.update(picked)
        if len(sentences) >= 4:
            break
    # If the term has only a classification, an explicitly labelled anatomical
    # type definition adds useful context without pretending it is a leaf definition.
    if len(sentences) < 2:
        queue = collections.deque((p, 1) for p in term['parents'])
        seen = {term['id']}
        while queue:
            id, depth = queue.popleft()
            if id in seen or id not in all_terms or depth > 2:
                continue
            seen.add(id)
            parent = all_terms[id]
            if parent['definition']:
                sentences.append(f"Anatomical type — {parent['name']}: {definition_text(parent['definition'])}")
                facts.append({'subject': id, 'relation': 'type_definition', 'appliesTo': term['id']})
                used.add(id)
                # Keep the asserted path so applicability is auditable.
                used.update(seen)
                break
            queue.extend((p, depth + 1) for p in parent['parents'])
    if not sentences:
        raise ValueError(f"No descriptive evidence for {term['id']} ({term['name']})")
    return ' '.join(sentences), facts, used


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=ROOT / 'work/description-sources')
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    pins = read_json(DATA / 'description-sources.json')
    args.source_dir.mkdir(parents=True, exist_ok=True)
    for record in pins['files']:
        path = args.source_dir / record['name']
        if not path.exists() and args.download:
            print('Downloading ' + record['name'], flush=True)
            with urllib.request.urlopen(record['url']) as response:
                path.write_bytes(response.read())
        if not path.exists() or path.stat().st_size != record['bytes'] or digest(path) != record['sha256']:
            raise ValueError(f'Missing or changed source: {path}. Use --download for missing files.')
    terms = parse_fma(args.source_dir / 'fma.owl')
    terms.update(parse_uberon(args.source_dir / 'uberon.obo'))
    curation = read_json(DATA / 'description-curation.json')
    for name, id in curation['aliases'].items():
        if id not in terms:
            raise ValueError(f'Unrecognized curated target {name}: {id}')
    by_name = collections.defaultdict(set)
    for term in terms.values():
        for name in [term['name'], *term['synonyms']]:
            if name:
                by_name[normalize(name)].add(term['id'])

    def match(id, name):
        if canonical(id) in terms:
            return canonical(id), 'identifier'
        candidates = by_name[normalize(name)]
        fmas = [id for id in candidates if id.startswith('FMA:')]
        if len(fmas) == 1:
            return fmas[0], 'exact-name'
        if len(candidates) == 1:
            return next(iter(candidates)), 'exact-name'
        alias = curation['aliases'].get(normalize(name)) or curation['aliases'].get(unsided(name))
        return (alias, 'reviewed-alias') if alias else (None, None)

    records, evidence, used_terms, unresolved = {}, {}, set(), []
    catalogue_pins = {}
    provenance = {
        'bp3d': {'title': 'BodyParts3D 4.0 nomenclature and model membership', 'url': 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html'},
        'z-anatomy': {'title': 'Z-Anatomy source model labels', 'url': 'https://github.com/LluisV/Z-Anatomy/tree/6c7f9016bd5899ac8edafd31b9900c151df42ed6/Resources/Models/FBX'},
        'hra': {'title': 'Human Reference Atlas female source model', 'url': 'https://doi.org/10.48539/HBM352.BTSQ.586'},
    }
    for filename in ['atlas.json', 'atlas-female.json']:
        atlas_path = ROOT / 'public/models' / filename
        atlas = read_json(atlas_path)
        catalogue_pins[filename] = digest(atlas_path)
        parts = {p['id']: p for p in atlas['parts']}
        selections = list(atlas['concepts']) + [
            {'id': p['conceptId'], 'name': p['name'], 'elements': [p['id']]} for p in atlas['parts']]
        for selection in selections:
            id, name = selection['id'], selection['name']
            if id in records:
                continue
            mesh_ids = selection['elements']
            source = 'z-anatomy' if id.startswith('ZA_') else 'hra' if any(p.startswith('VH_F_') for p in mesh_ids) else 'bp3d'
            custom = curation['descriptions'].get(normalize(name)) or curation['descriptions'].get(unsided(name))
            term_id, method = match(id, name)
            if not term_id and len(mesh_ids) == 1:
                part = parts[mesh_ids[0]]
                term_id, method = match(part['conceptId'], part['name'])
                if term_id:
                    method = 'mesh-' + method
            used, facts = set(), []
            if custom:
                text, citations, kind = custom['text'], list(custom['sources']), custom.get('kind', 'structure')
                if term_id:
                    citations.append(term_id)
                citations.append(source)
                used.update(c for c in citations if c in terms)
                facts.append({'relation': 'curated', 'key': normalize(name) if normalize(name) in curation['descriptions'] else unsided(name)})
                method = 'curated'
            elif term_id:
                text, facts, used = describe(terms[term_id], terms)
                citations, kind = [term_id], 'structure'
                if method not in ('identifier', 'mesh-identifier'):
                    citations.append(source)
            else:
                unresolved.append({'id': id, 'name': name, 'elements': len(mesh_ids)})
                continue
            # Preserve the mesh's side without inventing a side-specific ontology
            # identifier. A broader alias is explicitly described as type context.
            note = None
            if term_id and method == 'reviewed-alias':
                note = f"Source anatomy: {terms[term_id]['name']}. Model labels specify the represented side or subset."
            if unsided(name).endswith('compact bone'):
                kind = 'model'
                note = 'This source selection represents compact bone of the named pelvic bone.'
            if custom and re.search(r'\b(?:left|right)\b', normalize(name)):
                side = re.search(r'\b(left|right)\b', normalize(name))[1]
                text = f'This is the {side}-sided structure. ' + text
            records[id] = {'name': name, 'text': text, 'kind': kind, 'citations': list(dict.fromkeys(citations))}
            if note:
                records[id]['note'] = note
            evidence[id] = {'name': name, 'matchedTerm': term_id, 'method': method,
                            'modelSource': source, 'facts': facts}
            if term_id:
                used.add(term_id)
            used_terms.update(used)
    if unresolved:
        write_json(ROOT / 'work/description-unresolved.json', unresolved)
        raise ValueError(f'{len(unresolved)} unresolved selections; see work/description-unresolved.json')
    # Retain all parent edges needed to verify inherited type definitions, not
    # unrelated portions of the 200 MB ontology.
    sources = {**provenance, **{k: {'title': v['title'], 'url': v['url']} for k, v in curation['sources'].items()}}
    for id in sorted(used_terms):
        term = terms[id]
        ontology = 'FMA' if id.startswith('FMA:') else 'UBERON'
        url = ('https://bioportal.bioontology.org/ontologies/FMA/?p=classes&conceptid=' +
               urllib.parse.quote(term['iri'], safe='')) if ontology == 'FMA' else (
               'https://www.ebi.ac.uk/ols4/ontologies/uberon/classes?iri=' + urllib.parse.quote(term['iri'], safe=''))
        sources[id] = {'title': f"{ontology}: {term['name']} ({id})", 'url': url}
    # Some facts reference targets that are evidence, not displayed citations.
    for record in records.values():
        for id in record['citations']:
            if id not in sources:
                raise ValueError(f'Missing citation {id}')
    payload = {'schemaVersion': 1, 'retrievedOn': pins['retrievedOn'], 'records': records,
               'sources': {id: sources[id] for id in sorted({s for r in records.values() for s in r['citations']})}}
    write_json(DATA / 'structure-descriptions.json', payload)
    write_json(DATA / 'description-evidence.json', {'schemaVersion': 1, 'catalogues': catalogue_pins,
               'records': evidence, 'terms': {id: terms[id] for id in sorted(used_terms)}})
    print(json.dumps({'records': len(records), 'terms': len(used_terms),
                      'methods': dict(collections.Counter(r['method'] for r in evidence.values())),
                      'kinds': dict(collections.Counter(r['kind'] for r in records.values()))}))


if __name__ == '__main__':
    main()
