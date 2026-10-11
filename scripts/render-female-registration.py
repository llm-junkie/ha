"""Render fixed, assembled projections from the shipped geometry and pinned pre-fix fixture.
Requires numpy and matplotlib; not needed to build or run the app.
"""
from pathlib import Path
import gzip,json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from matplotlib.lines import Line2D

ROOT=Path(__file__).resolve().parents[1]
MODELS=ROOT/'public/models'
atlas=json.loads((MODELS/'atlas-female.json').read_text())
fixture=json.loads((ROOT/'data/anatomy/uterosacral-source.json').read_text())
buffers=[gzip.decompress((MODELS/Path(c['gzip']).name).read_bytes()) for c in atlas['chunks']]

def mesh(identifier):
    p=next(p for p in atlas['parts'] if p['id']==identifier)
    b=buffers[p['chunk']]
    v=np.frombuffer(b,'<f4',p['vertexCount']*3,p['positions']).reshape(-1,3)
    i=np.frombuffer(b,'<u4',p['indexCount'],p['indices']).reshape(-1,3)
    return v,i

plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10})
fig,axes=plt.subplots(2,2,figsize=(13,10),facecolor='#f6f7f6')
fig.suptitle('Bilateral uterosacral ligament registration',fontsize=19,fontweight='bold',y=.97,color='#24382f')
fig.text(.5,.923,'Assembled geometry · identical scale and projection before/after · all source surfaces retained',ha='center',color='#52675c')

for row,(horizontal,vertical,label) in enumerate([(2,1,'Side projection'),(2,0,'Top projection')]):
    for col,stage in enumerate(['Imported model','Corrected registration']):
        ax=axes[row,col];ax.set_facecolor('#f6f7f6');ax.set_aspect('equal')
        for identifier,color,alpha in [('VH_F_sacrum','#9fac9d',.38),('VH_F_cervicovaginal_junction','#c8a6b3',.38),('VH_F_cervix','#c8a6b3',.3),('VH_F_vagina','#c8a6b3',.15)]:
            v,i=mesh(identifier)
            ax.add_collection(PolyCollection(v[i][:,:,[horizontal,vertical]]*1000,facecolors=color,edgecolors='none',alpha=alpha,zorder=1))
        for original,color in zip(fixture['parts'],['#c96834','#317b99']):
            if col==0:v=np.array(original['baselinePositions']);i=np.array(original['indices']).reshape(-1,3)
            else:v,i=mesh(original['id'])
            ax.add_collection(PolyCollection(v[i][:,:,[horizontal,vertical]]*1000,facecolors=color,edgecolors='none',zorder=3))
            cap=np.mean(v[original['posterior']],axis=0)*1000
            ax.scatter(cap[horizontal],cap[vertical],s=35,facecolor=color,edgecolor='#fff',linewidth=.8,zorder=4)
        ax.set_xlim(-170,-25)
        ax.set_ylim((785,975) if row==0 else (-75,75))
        ax.set_title(stage+' · '+label,loc='left',fontweight='bold',pad=14,color='#24382f')
        ax.set_xlabel('Posterior ← depth (mm) → Anterior',color='#52675c')
        ax.set_ylabel('Height (mm)' if row==0 else 'Right ← lateral position (mm) → Left',color='#52675c')
        ax.spines[['top','right']].set_visible(False)
        ax.spines[['bottom','left']].set_color('#c8d1cb')
        ax.tick_params(colors='#52675c',labelsize=9)
        if row==0:
            ax.text(.04,.96,'Posterior tip gap to sacral surface:\n47–51 mm' if col==0 else 'Posterior tip gap to sacral surface:\n0–3.4 mm (source: 0–4 mm)',transform=ax.transAxes,va='top',fontsize=10,color='#24382f',bbox=dict(facecolor='#f6f7f6',edgecolor='none',alpha=.9))

legend=[Line2D([],[],color='#c96834',lw=4,label='Right uterosacral ligament'),Line2D([],[],color='#317b99',lw=4,label='Left uterosacral ligament'),Line2D([],[],color='#9fac9d',lw=7,label='Sacrum'),Line2D([],[],color='#c8a6b3',lw=7,label='Cervicovaginal region')]
fig.legend(handles=legend,ncol=2,loc='lower center',bbox_to_anchor=(.5,.063),frameon=False)
fig.text(.5,.025,'The sacral surface is a geometric reference, not a claimed direct bone attachment.\nOriginal soft-tissue attachment anatomy remains unreviewed.',ha='center',fontsize=10,color='#52675c')
fig.subplots_adjust(left=.08,right=.965,top=.875,bottom=.17,hspace=.34,wspace=.28)
target=ROOT/'docs/images/uterosacral-registration-comparison.png'
target.parent.mkdir(parents=True,exist_ok=True)
fig.savefig(target,dpi=160,facecolor=fig.get_facecolor())
print(target)
