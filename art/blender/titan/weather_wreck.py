"""Phase 3: repeatable G4 damage and Palm seating, after the current Phase 2 fit.

  blender --background --python-exit-code 1 --python art/blender/titan/weather_wreck.py

Default always starts from the approved standing source through fit_wreck.py.
For iteration only, -- --baseline /absolute/path/to/phase2.blend may reuse an
already verified Phase 2 build. FIT is read only; no game file except titan.glb
is written. Phase 4 / LODs are deliberately outside this script.
"""
import bpy
import bmesh
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import fit_wreck as fit
from wreck_clearance import clip_objects, make_box, subtract_boxes


def mesh(part,name,vs,fs,mat='frame',mats=None):
    obj=fit.mesh(part,name,vs,fs,mat,mats)
    obj['phase']='3'
    return obj


def tube(part,name,points,radius,mat='frame',sides=8):
    obj=fit.tube(part,name,points,radius,mat,sides)
    obj['phase']='3'
    return obj


def gv(v): return Vector((v[0],-v[2],v[1]))


def road_point(s,d,h):
    return tuple(gv(s['p'])+gv(s['r']).normalized()*d+gv(s['u']).normalized()*h)


def strip(name,samples,lo,hi,depth=30,top=-10.2):
    # Bent guards with broad flat bearing faces and bevelled outer edges.
    # All panels are held by the hand, not by a changed finger/rig pose.
    vs=[]; fs=[]; mats=[]
    for s in samples:
        cross=[(lo-2,-depth),(lo-2,top-5),(lo,top),(hi,top),
               (hi+2,top-5),(hi+2,-depth)]
        vs.extend(road_point(s,d,h) for d,h in cross)
    fs.append(tuple(reversed(range(6)))); mats.append('slate')
    for j in range(len(samples)-1):
        for k in range(6):
            fs.append((6*j+k,6*j+(k+1)%6,6*(j+1)+(k+1)%6,6*(j+1)+k))
            mats.append('armour' if k in (1,2,3) else 'frame')
    fs.append(tuple(6*(len(samples)-1)+k for k in range(6)));mats.append('slate')
    return mesh('hand.R',name,vs,fs,mats=mats)


def palm_guards():
    samples=fit.ROAD['samples']
    # First fingertip contact is s476. The preceding road is an approach in air.
    # Three bent slats bridge the central fingers, retaining the splayed outer
    # fingers and thumb. Tops overlap by 1 m; visible seams recess below them.
    ss=[s for s in samples if 468<=s['s']<=556.1]
    for j,(lo,hi) in enumerate([(-29,-9),(-10,10),(9,29)],1):
        strip(f'fingertip-bent-bearing-{j}',ss,lo,hi,depth=43)
    # The articulated knuckle guard spans the missing s550–565 transition.
    ss=[s for s in samples if 548<=s['s']<=604.1]
    strip('knuckle-line-bent-guard',ss,-30,30,depth=39,top=-10.0)
    # Broad underside webs join the new guard into the existing palm shell.
    for side in (-1,1):
        pts=[road_point(s,side*29,-23) for s in ss[::2]]
        tube('hand.R',f'knuckle-guard-hinge-rail-{side}',pts,3.2,'gold')
    # The old palm narrows just before the fixed wrist; carry the same surface
    # across that last seam without changing the wrist or forearm.
    ss=[s for s in samples if 692<=s['s']<=728.1]
    strip('wrist-seam-bent-guard',ss,-29,29,depth=29,top=-10.2)


def flap(name,rows,widths,thickness=5,part='chest',outer='armour',axis=(1,0,0)):
    """Closed angular shell strip with a broken, deliberately unequal tip."""
    axis=Vector(axis).normalized();vs=[]
    for j,(p,w) in enumerate(zip(rows,widths)):
        p=Vector(p)
        # Each ring has a pale outer face, dark exposed edge and bronze inside.
        # Vary the last ring to form a genuine jagged lip, not a decal.
        tip=(j==len(rows)-1)
        a=p-axis*w/2; b=p+axis*w/2
        if tip:a.z-=4; b.z+=2
        vs.extend([tuple(a),tuple(b),tuple(b+Vector((0,-thickness,-thickness*.3))),tuple(a+Vector((0,-thickness,-thickness*.3)))])
    fs=[(3,2,1,0)];mats=['frame']
    for j in range(len(rows)-1):
        for k in range(4):
            fs.append((4*j+k,4*j+(k+1)%4,4*(j+1)+(k+1)%4,4*(j+1)+k))
            mats.append(outer if k==0 else ('frame' if k==2 else 'slate'))
    fs.append(tuple(4*(len(rows)-1)+k for k in range(4)));mats.append('slate')
    return mesh(part,name,vs,fs,mats=mats)


def surface_band(carrier,name):
    # Follow the actual carrier vertices, with 0.18m proud paint geometry and
    # 0.8m embedded depth. It cannot float above an independently authored fold.
    n=len(carrier.data.vertices)//4;vs=[];fs=[]
    centers=[(carrier.data.vertices[4*j].co+carrier.data.vertices[4*j+1].co)/2 for j in range(n)]
    for j in range(n):
        a=carrier.data.vertices[4*j].co;b=carrier.data.vertices[4*j+1].co
        tangent=centers[min(j+1,n-1)]-centers[max(j-1,0)]
        normal=(b-a).cross(tangent).normalized()
        left=a.lerp(b,.36);right=a.lerp(b,.64)
        vs.extend(tuple(v) for v in [left+normal*.18,right+normal*.18,right-normal*.8,left-normal*.8])
    fs.append((3,2,1,0))
    for j in range(n-1):fs.extend((4*j+k,4*j+(k+1)%4,4*(j+1)+(k+1)%4,4*(j+1)+k) for k in range(4))
    fs.append(tuple(4*(n-1)+k for k in range(4)))
    return mesh('chest',name,vs,fs,'red')


def wound_plates():
    # Root positions are measured on the actual surviving shell cut rim, not
    # inferred from the wound jamb. These curl only 20–45m from their anchors.
    west=flap('peeled-wound-shell-west',
         [(114,1608,142),(127,1624,160),(143,1641,155)], [34,37,23],7)
    crown=flap('peeled-wound-shell-crown',
         [(157,1528,196),(153,1550,211),(171,1574,201)], [44,43,25],7)
    surface_band(crown,'peeled-wound-red-band')
    # One smaller trapped scrap is held by the exposed bronze header; it is
    # deliberately secondary to the two shell-connected tears above.
    flap('wound-frame-held-scrap',[(280,1609,133),(297,1626,150),(309,1641,143)],[22,20,12],6)
    # The south opening has its own shell-connected tears, with unequal bends.
    flap('peeled-exit-shell-west',[(114,1321,142),(124,1301,154),(139,1283,148)],[31,29,18],7)
    flap('peeled-exit-shell-east',[(237,1412,196),(252,1394,205),(264,1379,188)],[38,34,21],7)
    # Tear notches in the formerly regular wound header and selected armour.
    cutters=[make_box((196,1620,148),((1,0,0),(0,1,0),(0,0,1)),((-5,5),(-18,18),(-8,10))),
             make_box((261,1620,144),((1,0,0),(0,1,0),(0,0,1)),((-4,4),(-18,18),(-6,12)))]
    header=bpy.data.objects.get('titan/chest/breach-header')
    if header:subtract_boxes(header,cutters);header['phase']='3'


def snapped_ribs():
    # Replace three existing regular loops with separated, bent, closed-ended
    # rib arcs. Positions outside these authored fracture intervals stay put.
    for number,x,gap in [(2,143,(.60,1.01)),(4,214,(1.18,1.66)),(5,254,(2.30,2.74))]:
        original=bpy.data.objects.get(f'titan/chest/chamber-rib-{number}')
        if original:bpy.data.objects.remove(original,do_unlink=True)
        a,b=gap
        angles=[b+(math.tau+a-b)*i/40 for i in range(41)]
        points=[]
        for i,angle in enumerate(angles):
            end=max(0,1-i/4)+max(0,1-(40-i)/4)
            sign=1 if i<20 else -1
            points.append((x+sign*end*13,1502+112*math.cos(angle)+end*7,92+112*math.sin(angle)-end*8))
        obj=tube('chest',f'snapped-rib-{number}',points,9.2,'frame',8)
        # Jagged fracture rings, keeping a capped exposed cross-section.
        for end,start in ((0,0),(1,40*8)):
            for k in range(8):
                v=obj.data.vertices[start+k]
                v.co.x+=[-2,1,3,-1,2,-3,1,0][(k+number)%8]
        for face in (obj.data.polygons[0],obj.data.polygons[-1]):face.material_index=fit.MATERIALS.index('verdigris')
        obj.data.update()
        # A short snapped fork remains beside each tear, rooted in the arc.
        p=Vector(points[2]);q=p+Vector((14,-8,-17));r=q+Vector((4,-3,-11))
        tube('chest',f'snapped-rib-{number}-bent-fork',[p,q,r],4.5,'frame',6)
    # Fracture one longitudinal member with a broad downward buckle.
    old=bpy.data.objects.get('titan/chest/chamber-longitudinal-frame-2')
    if old:
        bpy.data.objects.remove(old,do_unlink=True)
        y=1502+120*math.cos(.95);z=92+120*math.sin(.95)
        tube('chest','snapped-longitudinal-frame-west',[(96,y,z),(138,y,z),(155,y+8,z-12),(166,y+12,z-27)],6,'frame')
        tube('chest','snapped-longitudinal-frame-east',[(193,y-9,z-17),(215,y,z),(293,y,z)],6,'frame')


def conduits():
    # Large readable runs behind the ribs; no detail hangs across the driving
    # belt. Exact clearance subtraction is still applied to every surface.
    paths=[
      ('red-upper',[(106,1600,151),(148,1604,155),(191,1606,148),(227,1621,121),(241,1628,91)],2.9,'red'),
      ('slate-upper',[(104,1591,163),(144,1594,165),(182,1597,155),(211,1611,131),(216,1620,113)],3.8,'slate'),
      ('red-lower',[(108,1598,68),(142,1602,71),(165,1625,53),(172,1635,24)],3.1,'red'),
      ('slate-lower',[(112,1607,81),(144,1609,83),(165,1625,66),(184,1637,37),(185,1637,21)],4.1,'slate'),
      ('south-wall',[(111,1394,103),(151,1391,107),(202,1391,106),(240,1385,84),(257,1372,52)],3.2,'slate'),
      ('south-red',[(115,1385,94),(156,1381,97),(203,1382,94),(234,1378,71)],2.2,'red'),
    ]
    for name,points,radius,mat in paths:
        obj=tube('chest','cut-conduit-'+name,points,radius,mat,8)
        # Bright bronze exposed conductor at the cut end, contained in the cap.
        p=Vector(points[-1]);q=Vector(points[-2]);direction=(p-q).normalized()
        tube('chest','cut-cable-core-'+name,[p-direction*.3,p+direction*.65],radius*.42,'frame',6)
    samples=[s for s in fit.ROAD['samples'] if 5832<=s['s']<=6020]
    for j,(offset,h,mat) in enumerate([(-12,17,'slate'),(-12,12,'red')]):
        # Outside the outer bronze wall, not above the corridor or in its lane.
        points=[road_point(s,-s['hw']+s['shift'][0]+offset,s['rise'][0]+h) for s in samples[::3]]
        tube('chest',f'hull-wall-conduit-{j}',points,1.7,mat)


def drift(part,name,center,radii,height,seed):
    # Irregular low dune lobes, closed beneath z=0. The model has no sand slot;
    # its existing pale armour slot is also used for these physical sand masses.
    cx,cy,cz=center;rx,ry=radii;n=13;vs=[];fs=[]
    for ring,scale in enumerate((1,.67,.31)):
        for k in range(n):
            a=math.tau*k/n
            variation=1+.09*math.sin(k*2.7+seed)+.06*math.cos(k*1.2+seed)
            x=cx+rx*scale*variation*math.cos(a)
            y=cy+ry*scale*variation*math.sin(a)
            z=cz-1.8 if ring==0 else cz+height*(.64 if ring==1 else .96)*(1+.08*math.sin(k+seed))
            vs.append((x,y,z))
    top=len(vs);vs.append((cx-rx*.06,cy+ry*.08,cz+height))
    for ring in range(2):
        for k in range(n):fs.append((ring*n+k,ring*n+(k+1)%n,(ring+1)*n+(k+1)%n,(ring+1)*n+k))
    for k in range(n):fs.append((2*n+k,2*n+(k+1)%n,top))
    fs.append(tuple(reversed(range(n))))
    obj=mesh(part,'sand-drift-'+name,vs,fs,'armour')
    obj['surface_role']='pale sand accumulation; existing armour material'
    return obj


def sand_and_debris():
    # Mounds intersect the wreck or its partly buried fragments, rather than
    # floating at world zero or scattering evenly across the desert.
    recipes=[('chest','north-wound',(199,1644,0),(93,49),18),
             ('chest','ribcage-hollow',(211,1500,-2),(73,92),11),
             ('chest','south-exit',(219,1360,0),(78,42),14),
             ('neck','fallen-collar',(-210,1436,0),(72,107),22),
             ('sword','broken-pommel',(502,344,0),(47,38),6)]
    for i,(part,name,c,r,h) in enumerate(recipes):drift(part,name,c,r,h,i+.7)
    # Add leeward side accumulations at two actual buried limb bounds.
    for part in ('thigh.L','shin.R'):
        os=[o for o in fit.TITAN.all_objects if o.type=='MESH' and o.get('part')==part]
        vs=[v.co for o in os for v in o.data.vertices]
        lo=Vector(tuple(min(v[k] for v in vs) for k in range(3)))
        hi=Vector(tuple(max(v[k] for v in vs) for k in range(3)))
        center=((lo.x+hi.x)/2+42, (lo.y+hi.y)/2,0)
        drift(part,part.replace('.','-')+'-lee',center,(87,(hi.y-lo.y)*.47),17,2.4)
    # Substantial buried ivory chips with bronze backs, near the wound only.
    for i,(x,y,z,w) in enumerate([(146,1660,7,18),(243,1680,8,26),(292,1652,5,15),(257,1350,6,19)]):
        flap(f'wound-debris-{i}',[(x,y,z-7),(x+3,y+12,z+7),(x+7,y+19,z+2)],[w,w*.8,w*.5],5)


def edge_damage():
    # A few broad corner bites and shallow dents, not rivets or scratch texture.
    # Derive cuts from existing bounds so the same scripts rebuild identically.
    candidates=[]
    for part,key in [('shoulder.R','pauldron'),('shoulder.L','pauldron'),('forearm.L','armour'),('shin.R','armour'),('shin.L','armour')]:
        os=[o for o in fit.TITAN.all_objects if o.type=='MESH' and o.get('part')==part and key in o.name]
        if not os:continue
        obj=max(os,key=lambda o:len(o.data.polygons)); candidates.append(obj)
        vs=[v.co.copy() for v in obj.data.vertices]
        lo=Vector(tuple(min(v[k] for v in vs) for k in range(3)));hi=Vector(tuple(max(v[k] for v in vs) for k in range(3)))
        # Chip a corner above the burial line with a slanted plane, capped so
        # armour retains thickness. The bite is <8% of the silhouette span.
        normal=Vector((1,-.5,.7)).normalized()
        extreme=max(v.dot(normal) for v in vs)
        depth=min(9,(hi-lo).length*.035)
        point=normal*(extreme-depth)
        fit.cut_plane(obj,point,normal,False)
        # Broad smooth dent in the exposed upper edge; no high-frequency noise.
        fit.densify(obj,18)
        c=Vector((hi.x-14,(lo.y+hi.y)/2,hi.z-8))
        for v in obj.data.vertices:
            d=(v.co-c).length
            if d<23:v.co.z-=4.5*(1-d/23)**2
        obj.data.update();obj['phase']='3';obj['damage']='capped corner chip and broad shallow dent'
    return [o.name for o in candidates]


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--baseline',type=Path)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.baseline:
        bpy.ops.wm.open_mainfile(filepath=str(args.baseline.resolve()))
        fit.TITAN=bpy.data.collections['TITAN']
    else:fit.build_wreck()
    assert bpy.app.version[:2]==(5,2)
    palm_guards();wound_plates();snapped_ribs();conduits();sand_and_debris()
    chipped=edge_damage()
    # All damage is subject to the same exact triangle clipping as Phase 2.
    # Only the inherited, specifically named arm/halo/Hull-roof exceptions stand.
    for obj in list(fit.TITAN.all_objects):
        if obj.type=='MESH':fit.cut_plane(obj,(0,0,-20),(0,0,1),True)
    stats=clip_objects([o for o in fit.TITAN.all_objects if o.type=='MESH'],HERE/'fit/road.json',margin=1.0)
    (HERE/'phase3-clipping.json').write_text(json.dumps(stats,indent=2)+'\n')
    bpy.context.scene.name='Titan — Phase 3 broken and weathered'
    fit.export_wreck(phase=3,refinements=[
        'Current regenerated road fit rebuilt from the approved standing source; rig, Halo and Sword targets unchanged.',
        'Three bent fingertip slats, an articulated knuckle guard and wrist seam plate carry the full Palm road width from first fingertip contact to the fixed wrist. Splayed outer fingers remain visible.',
        'Ivory shell peeled at measured surviving north and south armour-cut edges; one secondary frame-held scrap. Red band is embedded directly in its bent carrier.',
        'Ribs 2, 4 and 5 severed with jagged capped ends and bent forks; one longitudinal member buckled and broken.',
        'Large slate and red conduits hang behind the ribs, with exposed bronze cable cores; Hull wall runs stay outside the corridor.',
        'Pale faceted sand accumulations use the existing armour material; no extra material slot or exported ground plane.',
        'Capped corner chips and shallow dents: '+', '.join(chipped),
        'Every final surface re-clipped against current keepout and sky with 1 m safety margin; no new sky exemption.',
        'Phase 4 LOD work not started.'
    ])

if __name__=='__main__':main()
