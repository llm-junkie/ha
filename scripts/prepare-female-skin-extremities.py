"""Prepare pinned external hand/foot patches after export-female-skin-scaffold.mjs.
Requires numpy, scipy and trimesh only when regenerating the fixture."""
import sys,json,hashlib
from pathlib import Path
from skin_extremities import clip_plane,boundary_ring
from skin_smoothing import smoothstep
import numpy as np
import trimesh

vertices=np.fromfile('work/female-skin-reference/positions.bin','<f4').reshape(-1,3)
faces=np.fromfile('work/female-skin-reference/indices.bin','<u4').reshape(-1,3)
m=trimesh.Trimesh(vertices,faces,process=True)
data={};regions=[]
for label,y,sign in [('left_hand',.885,1),('right_hand',.885,-1),('left_foot',.155,1),('right_foot',.155,-1)]:
 v=m.vertices;f=m.faces;t=v[f]
 mask=(t[:,:,0]*sign>(.18 if 'hand' in label else .01)).all(axis=1)&(t[:,:,1]<(y+.05)).any(axis=1)
 patch=trimesh.Trimesh(v,f[mask],process=True)
 vv,ff=clip_plane(patch.vertices,patch.faces,y,False)
 outer=max(trimesh.Trimesh(vv,ff,process=True).split(only_watertight=False),key=lambda q:q.area)
 ring=boundary_ring(outer.vertices,outer.faces,y)
 v=outer.vertices.copy();n=outer.vertex_normals
 amount=.0035 if 'hand' in label else .003
 fade=1-smoothstep(y-.035,y-.010,v[:,1])
 displacement=amount*fade[:,None]*n
 if 'hand' in label:
  local=np.exp(-.5*(((abs(v[:,0])-.276)/.010)**2+((v[:,1]-.744)/.012)**2+((v[:,2]-.040)/.010)**2))
  displacement[:,0]-=sign*.0012*local
 if 'foot' in label: displacement[:,1]-= .001*(1-smoothstep(.015,.035,v[:,1]))
 original=v.copy();tri=original[outer.faces]
 before=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);blend=np.ones(len(v))
 for attempt in range(100):
  v=original+displacement*blend[:,None];tri=v[outer.faces]
  after=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
  bad=(np.einsum('ij,ij->i',before,after)<=0)|(np.linalg.norm(after,axis=1)<2e-14)
  if not bad.any():break
  blend[np.unique(outer.faces[bad])]*=.5
 else:raise ValueError('Posed patch clearance reversed triangles')
 data[label+'_vertices']=v.astype('<f4');data[label+'_faces']=outer.faces.astype('<u4');data[label+'_ring']=ring.astype('<u4')
 regions.append({'name':label,'side':sign,'bodyCutM':.90 if 'hand' in label else .175,'patchCutM':y,'outwardClearanceM':amount})
 print(label,len(v),len(outer.faces),len(ring),flush=True)
p=Path('data/anatomy/female-skin-extremities.npz');np.savez_compressed(p,**data)
b=p.read_bytes()
recipe_path=Path('data/anatomy/female-skin.json');recipe=json.loads(recipe_path.read_text())
previous=recipe['registration'].get('posedExtremities',{})
recipe['registration']['posedExtremities']={'path':p.name,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'source':'BodyParts3D FJ2810 external skin, transformed by the existing female body morph','license':'CC-BY-4.0','regions':regions,**{k:previous[k] for k in ['referenceChunk','referenceMorphReportSha256'] if k in previous}}
if 'external hand/foot reference patches' not in recipe['method']:recipe['method']+='; external hand/foot reference patches in the atlas pose joined at wrist/ankle collars'
recipe_path.write_text(json.dumps(recipe,separators=(',',':'))+'\n')
print('fixture',len(b),hashlib.sha256(b).hexdigest())
