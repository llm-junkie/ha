import catalogue from '../data/anatomy/structure-descriptions.json' with { type: 'json' };
import { SYSTEMS, type Part, type SystemId } from './anatomy.ts';
import type { SearchConcept } from './anatomy-search.ts';

interface DescriptionRecord {
  name: string;
  text: string;
  kind: 'structure' | 'model';
  citations: string[];
  note?: string;
}

export interface DescriptionSource {
  title: string;
  url: string;
}

export interface StructureDescription {
  kind: 'structure' | 'model' | 'group' | 'system';
  label: string;
  text: string;
  note?: string;
  sources: DescriptionSource[];
}

const records = catalogue.records as Record<string, DescriptionRecord>;
const sources = catalogue.sources as Record<string, DescriptionSource>;

export function systemOverview(system: SystemId): StructureDescription {
  return {
    kind: 'system',
    label: 'System overview (fallback)',
    text: SYSTEMS.find(item => item.id === system)?.description ?? '',
    note: 'No sourced description is available for this structure. This is general information about its anatomical system.',
    sources: [],
  };
}

/** Use exact catalogue identities; a similar name cannot select another structure's text. */
export function describeStructure(
  selection: Pick<SearchConcept, 'id' | 'name' | 'elements' | 'searchGroup'>,
  parts: readonly Pick<Part, 'id' | 'name' | 'conceptId' | 'system'>[],
): StructureDescription {
  if (selection.searchGroup) {
    return {
      kind: 'group', label: 'Explorer group description',
      text: selection.searchGroup.description,
      sources: [{
        title: 'UAMS Department of Neuroscience, Muscles of the Lower Limb',
        url: 'https://medicine.uams.edu/neuroscience/education/medical-school-courses/human-structure-module/anatomy-tables/muscle-tables/muscles-of-the-lower-limb/',
      }],
    };
  }
  const first = parts[0];
  // A saved selection can use its first mesh's ID while containing many pieces.
  // Describe that selection, rather than attributing the first piece's anatomy to all.
  if (first && selection.id === first.id && selection.elements.length > 1) {
    return {
      kind: 'group', label: 'Saved selection',
      text: `A saved view containing ${selection.elements.length.toLocaleString()} selected pieces. Select an individual piece to read its sourced description.`,
      sources: [],
    };
  }
  const record = records[selection.id] ?? (
    first && selection.id === first.id && selection.elements.length === 1
      ? records[first.conceptId] : undefined
  );
  if (!record) return systemOverview(first?.system ?? 'connective');
  return {
    kind: record.kind,
    label: record.kind === 'model' ? 'Model description' : 'Structure description',
    text: record.text,
    ...(record.note ? { note: record.note } : {}),
    sources: record.citations.map(id => sources[id]),
  };
}
