export type SystemId = 'skeletal'|'muscular'|'arterial'|'venous'|'nervous'|'digestive'|'respiratory'|'urinary'|'reproductive'|'mammary'|'lymphatic'|'endocrine'|'integumentary'|'connective'|'sensory'|'cardiac';
export const SYSTEMS: {id:SystemId;name:string;color:string;description:string}[] = [
 {id:'skeletal',name:'Skeleton',color:'#e2d9ba',description:'Bones form the supporting framework of the body, protect organs, and provide attachment points for muscles. Their internal tissue also stores minerals and produces blood cells.'},
 {id:'muscular',name:'Muscles',color:'#a85b50',description:'Skeletal muscles generate movement by pulling on their attachments. They move joints, stabilize posture, produce heat, and help with breathing, swallowing, and eye movements.'},
 {id:'cardiac',name:'Heart',color:'#b96760',description:'The heart is a muscular pump with four chambers. Its valves direct blood forward through the pulmonary and systemic circuits.'},
 {id:'sensory',name:'Sensory organs',color:'#b0c8ce',description:'These structures contribute to special senses, including sight, hearing, and balance. Their specialized tissues detect stimuli and work with the nervous system to convey information.'},
 {id:'arterial',name:'Arteries',color:'#c05245',description:'The heart drives blood through the circulation. Arteries carry blood away from the heart to supply tissues or, in the pulmonary circuit, to the lungs.'},
 {id:'venous',name:'Veins',color:'#527c9f',description:'Veins return blood toward the heart. Superficial and deep networks collect blood from the tissues; the pulmonary veins bring oxygenated blood back from the lungs.'},
 {id:'nervous',name:'Nervous system',color:'#d8b565',description:'The brain, spinal cord, and peripheral nerves carry and process signals. This layer also includes the represented cerebrospinal-fluid spaces, choroid plexuses, and supporting meninges.'},
 {id:'respiratory',name:'Respiratory',color:'#b98991',description:'The airways conduct air to the lungs, where oxygen and carbon dioxide move between air and blood. Breathing depends on pressure changes produced by respiratory muscles.'},
 {id:'digestive',name:'Digestive',color:'#b8916b',description:'The digestive tract breaks down food, absorbs nutrients and water, and moves waste onward. Accessory organs contribute bile and digestive enzymes.'},
 {id:'urinary',name:'Urinary',color:'#b47961',description:'The kidneys filter blood and regulate fluid, electrolyte, and acid–base balance. Urine travels through the ureters to the bladder and exits through the urethra.'},
 {id:'lymphatic',name:'Lymphatic',color:'#879f7c',description:'Lymphatic vessels return excess tissue fluid to the circulation. Lymph nodes and other lymphoid organs support immune surveillance and responses.'},
 {id:'endocrine',name:'Endocrine',color:'#c5a09a',description:'Endocrine organs release hormones into the blood to coordinate processes such as metabolism, growth, stress responses, and reproduction.'},
 {id:'reproductive',name:'Reproductive',color:'#bda098',description:'Reproductive organs contribute to gamete production, hormone secretion, and reproduction. The structures represented depend on the selected reference model.'},
 {id:'mammary',name:'Breast tissue',color:'#c7aca5',description:'Breast tissue includes mammary glands, ducts, adipose tissue, and supporting connective tissue. It lies over the pectoral muscles; nipple and areolar surfaces appear in the optional Body surface layer.'},
 {id:'integumentary',name:'Body surface',color:'#ba9b7d',description:'The body surface provides an outer anatomical reference. The integumentary system forms a protective barrier and contributes to sensation and temperature regulation.'},
 {id:'connective',name:'Connective tissue',color:'#aec3bb',description:'Fascia, cartilage, intervertebral discs, tendons, ligaments, and other connective tissues support, connect, and separate structures. Their roles include stabilizing joints and distributing mechanical loads.'},
];
export interface Part {id:string;name:string;conceptId:string;system:SystemId;chunk:number;positions:number;normals:number;indices:number;vertexCount:number;indexCount:number;bounds:[number[],number[]]}
export interface Concept {id:string;name:string;elements:string[]}
export interface Atlas {version:string;sex?:'male'|'female';source?:string;scope?:string;parts:Part[];concepts:Concept[];chunks:{url:string;bytes:number;gzip?:string;gzipBytes?:number}[];triangles:number}
export type View = 'three-quarter'|'front'|'back'|'side';
// Rotation speed uses a 1–10 multiplier, displayed as 10–100%.
export const MIN_ROTATION_SPEED = 1;
export const MAX_ROTATION_SPEED = 10;
export const DEFAULT_ROTATION_SPEED = 5;
export interface CameraPose {position:[number,number,number];target:[number,number,number];offset:[number,number];viewport?:[number,number]}
export interface SceneState {inspectorOpen?:boolean;explode:number;visible:SystemId[];selected:string[];isolate:boolean;view:View;rotate:boolean;reset:number;focus?:number;focusContext?:boolean;partVisibility?:Record<string,boolean>;opacity?:Partial<Record<SystemId,number>>;camera?:CameraPose;rotationSpeed?:number;rotationDirection?:'clockwise'|'counterclockwise'}
export const DEFAULT_VISIBLE:SystemId[] = ['cardiac','sensory','skeletal','muscular','arterial','venous','nervous','respiratory','digestive','urinary','lymphatic','endocrine','reproductive','mammary','integumentary','connective'];
const ILIOTIBIAL_DESCRIPTION = 'A thickened band of deep fascia (fascia lata) along the outer thigh. It receives fibers from tensor fasciae latae and gluteus maximus, with connections to the femur and an attachment on the upper outer tibia.';
export const EXPLANATIONS:Record<string,string> = {
 'female body skin':'The full-body external female skin surface, fitted from the Human Reference Atlas to this experimental anatomy assembly. It provides an outer body reference; the fit and proportions have not been independently reviewed.',
 'iliotibial tract':ILIOTIBIAL_DESCRIPTION,
 'right iliotibial tract':ILIOTIBIAL_DESCRIPTION,
 'left iliotibial tract':ILIOTIBIAL_DESCRIPTION,
 'third ventricle':'A cerebrospinal-fluid space in the diencephalon. It communicates with the lateral ventricles through the interventricular foramina and with the fourth ventricle through the cerebral aqueduct.',
 'fourth ventricle':'A cerebrospinal-fluid space between the brainstem and cerebellum. It communicates with the cerebral aqueduct, the central canal of the spinal cord, and the subarachnoid space.',
 'lateral ventricle':'A cerebrospinal-fluid space within a cerebral hemisphere. It communicates with the third ventricle through an interventricular foramen.',
 'interventricular foramen':'A passage connecting a lateral ventricle of the brain to the third ventricle, allowing cerebrospinal fluid to circulate.',
 'choroid plexus of cerebral hemisphere':'Specialized vascular and epithelial tissue within a lateral ventricle of the brain that produces cerebrospinal fluid.',
 'flexor retinaculum of wrist':'A strong fibrous band spanning the front of the wrist. It forms the roof of the carpal tunnel over the flexor tendons and median nerve.',
 'common tendinous ring':'A fibrous structure at the orbital apex that provides a common origin for the extraocular rectus muscles.',
 'gingiva of upper jaw':'The gum tissue around the upper teeth. This oral mucosa helps protect the supporting tissues of the teeth.',
 'gingiva of lower jaw':'The gum tissue around the lower teeth. This oral mucosa helps protect the supporting tissues of the teeth.',
 'heart':'A muscular pump in the chest. Its right side sends blood to the lungs; its left side sends blood through the systemic circulation.',
 'liver':'A large organ beneath the right side of the diaphragm. It processes absorbed nutrients, produces bile, and synthesizes many proteins carried in the blood.',
 'brain':'The central organ of the nervous system. Its interconnected regions support perception, movement, memory, language, and the regulation of bodily functions.',
 'stomach':'A muscular chamber between the esophagus and small intestine. It stores and mixes food with acid and enzymes before releasing it into the duodenum.',
 'spleen':'A lymphoid organ in the upper left abdomen. It filters blood, removes aging blood cells, and participates in immune responses.',
 'pancreas':'An abdominal organ with digestive and endocrine roles. It supplies enzymes to the small intestine and releases hormones including insulin and glucagon.',
 'urinary bladder':'A muscular reservoir in the pelvis that stores urine arriving from the kidneys through the ureters.',
 'trachea':'The main airway connecting the larynx to the bronchi. Its cartilage supports keep the airway open during breathing.',
 'diaphragm':'A broad muscle separating the chest and abdomen. When it contracts, it increases chest volume and helps draw air into the lungs.',
};
// References for the corrected structures: data/anatomy/classification-overrides.json.
export function explanation(name:string,system:SystemId){
 const normalized=name.toLowerCase();
 const specific=EXPLANATIONS[normalized] ?? EXPLANATIONS[normalized.replace(/\b(?:right|left)\s+/g,'')];
 if(specific)return specific;
 if(system==='digestive' && /\btooth\b/.test(normalized))return 'A tooth used for mechanical digestion, cutting or grinding food during chewing. Teeth contain enamel, dentin, and pulp and are accessory digestive organs.';
 if(system==='digestive' && normalized.startsWith('hepatovenous segment '))return 'A region of liver tissue described by its hepatic venous drainage territory. It contributes to the functions of the liver, including nutrient processing and bile production.';
 if(system==='connective' && normalized.startsWith('intervertebral disk'))return 'A disc between adjacent vertebral bodies, with a fibrocartilaginous outer ring and a softer central core. It distributes loads and permits movement of the spine.';
 if(system==='connective' && /\bcartilage\b/.test(normalized))return 'A supportive connective-tissue structure. Cartilage provides a resilient framework in locations such as the rib cage, nose, and larynx.';
 if(system==='cardiac' && /\bpapillary muscle\b/.test(normalized))return 'A projection of ventricular heart muscle connected to an atrioventricular valve by chordae tendineae. Its contraction helps prevent the valve leaflets from prolapsing during ventricular contraction.';
 return SYSTEMS.find(s=>s.id===system)?.description ?? '';
}
