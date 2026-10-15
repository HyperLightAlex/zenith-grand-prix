"""Tempest sheet interpretation, executed inside build_roster.py.

Shared armor language, three distinct silhouettes. Keep the race skeleton,
loadouts, wheels and physical booster bells. All bright inlays are authored
on their mount's surface; opposite sides use positive-scale geometry.
"""

def tempest_skip(p):
    if p.get('nozzle'):return False
    j=p['joint'];slot=p['slot'];v=p['positions']
    lo=[min(v[a::3]) for a in range(3)];hi=[max(v[a::3]) for a in range(3)]
    cx=(lo[0]+hi[0])/2
    if j=='head':return slot!='K'
    if j=='chest':
        # Two diagonal halo struts originally crossed the main jet throats.
        # Replace the old four-spoke mount with side brackets outside the jets.
        if MODEL=='raijin' and slot=='T' and lo[2]>-1.93 and hi[2]<-1.83:return True
        if slot=='P':return True
        if slot in ('S','T','G') and lo[2]>0:return True
        # Old wrapped breast bands and Fujin's ring/turbine are replaced.
        if slot in ('S','T') and hi[2]>.3 and hi[0]-lo[0]>1.3:return True
        if MODEL=='fujin' and slot in ('S','T','G') and hi[2]<-.85:return True
    if j=='spine' and slot in ('S','K'):return True
    if j=='hips' and slot in ('P','S','T','G'):return True
    if j.startswith('skirt') and slot!='K':return True
    if j.startswith('hip') and j!='hips' and slot in ('P','S','T','G'):return True
    if j.startswith('knee') and slot in ('P','S','T','G'):return True
    if j.startswith('ankle') and slot in ('P','S','T'):return True
    if j.startswith('wing') and MODEL=='kamaitachi' and slot!='K':return True
    if j.startswith('sh') and slot in ('P','S','T','G'):
        # Raijin's three lightning rods are already correctly mounted.
        return not (MODEL=='raijin' and lo[1]>.22)
    if j.startswith('el'):
        if slot=='P':return True
        if MODEL=='kamaitachi' and slot in ('S','T','G'):return True
        # Keep Fujin's left snare and Raijin's right scatter cannon.
        if slot in ('S','T','G') and abs(cx)<(.67 if role==2 else .37):return True
    if MODEL=='fujin' and j=='wrR':return True
    return False

def tempest_seat(ob,j,slots=('P',),clearance=.018):
    # Tessellate before projection so a broad face cannot bridge through a
    # ridge even when its boundary vertices are correctly seated.
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=1,use_grid_fill=True)
    bm.to_mesh(ob.data);bm.free();ob.data.update()
    fit_front(ob,j,slots,clearance)
    return ob

def tempest_bolt(name,j,x,y,z,h,slots=('P',)):
    # Equal left/right extent, centred on the mount rather than the original
    # bolt's offset bounding box. A bolt is chiral; its placement is not.
    pts=[(-.02,.50),(.22,.50),(.025,.10),(.24,.10),(-.21,-.50),(-.055,-.07),(-.24,-.07)]
    ob=plate(name,j,'G',[(x+a*h,y+b*h) for a,b in pts],z,.016,0)
    return tempest_seat(ob,j,slots,.022)

def tempest_streak(name,j,points,z,width=.035):
    # One continuous ribbon; no disjoint or overlapping glowing segments.
    edges=[]
    for n,(x,y) in enumerate(points):
        a=Vector(points[max(0,n-1)]);b=Vector(points[min(len(points)-1,n+1)])
        d=(b-a).normalized();normal=Vector((-d.y,d.x))*width*.5
        edges.append(((x+normal.x,y+normal.y),(x-normal.x,y-normal.y)))
    pts=[p[0] for p in edges]+[p[1] for p in reversed(edges)]
    return plate(name,j,'G',pts,z,.014,0)

def tempest_ring(name,j,at,r,width,slot='T',axis='z',segments=24):
    vs=[]
    for depth,rad in ((-.035,r-width),(-.035,r),(.035,r),(.035,r-width)):
        for n in range(segments):
            a=2*math.pi*n/segments;u=rad*math.cos(a);v=rad*math.sin(a)
            p=(depth,u,v) if axis=='x' else (u,v,depth)
            vs.append(tuple(at[k]+p[k] for k in range(3)))
    faces=[(q*segments+i,q*segments+(i+1)%segments,((q+1)%4)*segments+(i+1)%segments,((q+1)%4)*segments+i) for q in range(4) for i in range(segments)]
    return mesh(name,j,slot,vs,faces,.006)

def tempest_turbine(j,s,x,y,z,r):
    disc('Tempest / turbine drum',j,'S',(s*x,y,z),r,.24,'x',16)
    disc('Tempest / turbine green casing',j,'P',(s*(x+.02),y,z),r*1.08,.17,'x',16)
    disc('Tempest / turbine dark well',j,'D',(s*(x+.135),y,z),r*.87,.035,'x',16)
    tempest_ring('Tempest / turbine concentric rim',j,(s*(x+.16),y,z),r*1.02,r*.13,'T','x',20)
    for n in range(8):
        a=2*math.pi*n/8
        pts=[]
        for radius,offset in ((.25,0),(.72,-.12),(.84,.18),(.40,.35)):
            pts.append((z+math.sin(a+offset)*radius*r,y+math.cos(a+offset)*radius*r))
        side_plate('Tempest / turbine vane',j,'F',pts,s*(x+.16),.035,.003)
    disc('Tempest / turbine hub',j,'T',(s*(x+.195),y,z),r*.22,.065,'x',12)

def tempest_skirt(j,w,h,z,reverse=False):
    # Jagged hem but symmetric cut: each side hangs from an existing skirt
    # joint, so knees can rise without driving through a rigid waist plate.
    pts=[(-w,.12),(w,.12),(w*.91,-h*.69),(w*.56,-h*.59),(w*.42,-h),(0,-h*.83),(-w*.42,-h),(-w*.56,-h*.59),(-w*.91,-h*.69)]
    objs=[plate('Tempest / skirt gold hem',j,'T',pts,z,.085,.008),
          faceted('Tempest / emerald skirt lame',j,'P',[(x*.87,.07+(y-.12)*.91) for x,y in pts],z+.055,.075,.02)]
    # Black cloth-like inset is a solid rigid panel, not a floating decal.
    objs.append(plate('Tempest / skirt dark inset',j,'S',[(-w*.12,.06),(w*.12,.06),(w*.28,-h*.74),(0,-h*.82),(-w*.28,-h*.74)],z+.107,.025,.004))
    if reverse:
        for ob in objs:
            for v in ob.data.vertices:v.co.y*=-1
            bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()

def tempest_skate(j):
    # Keep the original wheel train; build a low pointed cover around it.
    length=(1.50,1.65,2.05)[role];w=(.34,.39,.56)[role];base=-dims['ankleY']+.38
    sections=[(-.72,w*.78,base+.16),(-.16,w,base+.46),(.38,w*.90,base+.43),
              (length*.70,w*.72,base+.24),(length,.06,base+.08)]
    vs=[]
    for z,width,top in sections:vs.extend([(-width,base,z),(width,base,z),(width,top-.10,z),(width*.30,top,z),(-width*.30,top,z),(-width,top-.10,z)])
    faces=[tuple(range(5,-1,-1)),tuple(range(24,30))]+[(n*6+i,n*6+(i+1)%6,(n+1)*6+(i+1)%6,(n+1)*6+i) for n in range(4) for i in range(6)]
    ob=mesh('Tempest / pointed emerald skate',j,'P',vs,faces,.013)
    for p in ob.data.polygons:p.use_smooth=False
    for s in (-1,1):
        toe=[]
        for z,width,top in sections[2:]:toe.extend([(s*width*.35,top+.006,z),(s*width*.67,top-.05,z)])
        mesh('Tempest / gold toe rail',j,'T',toe,[(0,1,3,2),(2,3,5,4)],0)
        side_plate('Tempest / gold heel spur',j,'T',[(-.45,-.13),(-.96,.12),(-.82,-.30),(-.47,-.36)],s*w*.62,.09,.008)

def tempest_helmet():
    start=len(meshes)
    j='head';k=(1,1.05,1.27)[role]
    armor_loft('Tempest / faceted kabuto',j,'P',[(.11,.30*k,-.33,.31),(.37,.44*k,-.41,.40),(.71,.40*k,-.39,.38),(.93,.25*k,-.28,.23),(.98,.10*k,-.17,.12)])
    for n in range(3):
        y=.39-n*.21;w=(.44+n*.035)*k
        armor_loft('Tempest / rear helmet lame',j,'P',[(y-.13,w,-.40-n*.06,.07),(y+.07,w*.83,-.38-n*.055,.01)])
    face=[(-.30*k,.48),(.30*k,.48),(.27*k,.06),(0,-.17),(-.27*k,.06)]
    faceted('Tempest / menpo face',j,'S',face,.49,.18,.05)
    faceted('Tempest / dark visor recess',j,'D',[(-.39*k,.64),(0,.56),(.39*k,.64),(.34*k,.42),(0,.38),(-.34*k,.42)],.48,.09,.012)
    for s in (-1,1):
        plate('Tempest / centred paired visor',j,'G',[(s*.025,.515),(s*.34*k,.584),(s*.30*k,.507),(s*.025,.448)],.54,.018,0)
        faceted('Tempest / temple gold vane',j,'T',[(s*.33*k,.53),(s*.90*k,.91),(s*.73*k,.48),(s*.43*k,.37)],.13,.11,.022)
    if MODEL=='kamaitachi':
        for s in (-1,1):
            pts=[(s*.025,.69),(s*.36,.77),(s*.71,1.06),(s*.87,1.49),(s*.52,1.07),(s*.28,.93),(s*.025,.85)]
            faceted('Kamaitachi / sweeping gold brow',j,'T',pts,.44,.12,.03)
        faceted('Kamaitachi / central forehead scale',j,'P',[(-.13,.91),(0,1.12),(.13,.91),(0,.74)],.50,.10,.025)
    elif MODEL=='fujin':
        block('Fujin / crown stem',j,'T',(0,1.03,.19),(.055,.30,.07),.008)
        tempest_ring('Fujin / crown eye',j,(0,1.26,.19),.16,.058,'T','z',20)
        for y in (.12,.21,.30):block('Fujin / respirator slit',j,'D',(0,y,.577),(.23,.026,.025),.003)
    else:
        block('Raijin / recessed mouth','head','D',(0,.045,.637),(.55,.18,.035),.008)
        for s in (-1,1):
            pts=[(s*.20,.70),(s*.51,1.09),(s*.73,1.57),(s*.79,2.02),(s*.69,2.20),(s*.64,1.65),(s*.39,1.12),(s*.10,.83)]
            faceted('Raijin / gold thunder horn',j,'T',pts,.39,.15,.04)
            plate('Raijin / upper menpo fang',j,'T',[(s*.18,.17),(s*.28,.17),(s*.23,-.035)],.663,.045,.003)
            plate('Raijin / lower menpo fang',j,'T',[(s*.055,-.10),(s*.145,-.10),(s*.10,.035)],.663,.045,.003)
    # Lift the complete helmet above the new cuirass collar. The retained
    # neck spindle still overlaps it; the chin is no longer buried in armor.
    for ob in meshes[start:]:
        for v in ob.data.vertices:v.co.z=v.co.z*(1.10 if role==2 else 1)+(.24 if role==2 else .16)
        ob.data.update()

def tempest_crescents():
    for s in (-1,1):
        j='wingL' if s==1 else 'wingR'
        disc('Kamaitachi / crescent hinge',j,'F',(0,0,0),.20,.28,'z',16)
        pts=[(0,-.43),(.33,-.31),(.74,.10),(1.02,.79),(1.10,1.42),(1.38,2.13),(1.79,2.58),
             (1.25,2.31),(.77,1.85),(.43,1.16),(.25,.52),(-.10,.13)]
        pts=[(s*x,y) for x,y in pts]
        faceted('Kamaitachi / gold crescent edge',j,'T',pts,-.07,.16,.025)
        inner=[(s*.21,-.20),(s*.58,.12),(s*.84,.81),(s*.94,1.46),(s*1.19,2.09),
               (s*.86,1.75),(s*.55,1.11),(s*.36,.45),(s*.07,.12)]
        faceted('Kamaitachi / emerald crescent',j,'P',inner,.014,.08,.025)
        ob=tempest_streak('Kamaitachi / crescent energy seam',j,[(s*.22,.07),(s*.50,.56),(s*.67,1.18),(s*.89,1.78),(s*1.16,2.14)],.085,.038)
        # A narrow strip follows the actual blade plane and exists on both faces.
        tempest_seat(ob,j,('T','P'),.018)
        rear=plate('Kamaitachi / crescent rear emerald',j,'P',inner,-.18,.025,.004)

def tempest_wind_ring():
    block('Fujin / rear race-number panel','chest','P',(0,1.15,-1.305),(.66,.58,.10),.024)
    # Mirror the physical ribbon; the AI sheet's changing twists resolve into
    # one closed arch with matched mounting feet and coherent lightning paths.
    path=[(1.04,1.10,.17),(1.30,1.68,.23),(1.51,2.36,.27),(1.31,3.01,.29),(.74,3.48,.23),(0,3.63,.19)]
    whole=[(-x,y,w) for x,y,w in path]+[(x,y,w) for x,y,w in reversed(path[:-1])]
    vs=[]
    for i,(x,y,w) in enumerate(whole):
        a=Vector(whole[max(0,i-1)][:2]);b=Vector(whole[min(len(whole)-1,i+1)][:2]);d=(b-a).normalized();nx,ny=-d.y,d.x
        z=-1.16-.10*abs(x)
        vs.extend([(x+nx*w,y+ny*w,z-.08),(x-nx*w,y-ny*w,z-.08),(x-nx*w,y-ny*w,z+.025),(x,y,z+.14),(x+nx*w,y+ny*w,z+.025)])
    n=len(whole);faces=[tuple(range(4,-1,-1)),tuple(range((n-1)*5,n*5))]+[(i*5+k,i*5+(k+1)%5,(i+1)*5+(k+1)%5,(i+1)*5+k) for i in range(n-1) for k in range(5)]
    ob=mesh('Fujin / sculpted wind ribbon','chest','P',vs,faces,.01)
    for p in ob.data.polygons:p.use_smooth=False
    for s in (-1,1):
        line=[(s*1.13,1.45),(s*1.35,1.97),(s*1.27,2.30),(s*1.38,2.58),(s*1.09,3.11),(s*.71,3.36)]
        ob=tempest_streak('Fujin / centred wind lightning','chest',line,-.90,.047)
        # Explicitly target only the ring, not the breastplate in front of it.
        targets=[m for m in meshes if m['joint']=='chest' and m['slot']=='P' and m.name.startswith('Fujin / sculpted wind ribbon')]
        other=[m for m in meshes if m not in targets and m!=ob and m['joint']=='chest' and m['slot']=='P']
        for m in other:m['slot']='temporary'
        try:tempest_seat(ob,'chest',('P',),.020)
        finally:
            for m in other:m['slot']='P'
        block('Fujin / wind ribbon mounting foot','chest','T',(s*1.04,1.12,-1.21),(.39,.22,.27),.025)
        # Streamers sit outside the rear nozzles and remain attached to the
        # power unit; they do not pass through either flame outlet.
        pts=[(s*1.14,1.32),(s*1.39,1.18),(s*1.57,.55),(s*1.50,-.28),(s*1.85,-1.08),
             (s*1.51,-.89),(s*1.30,-.41),(s*1.29,.41)]
        faceted('Fujin / rear wind streamer gold edge','chest','T',pts,-1.02,.10,.01)
        faceted('Fujin / rear wind streamer jade','chest','P',[(s*(abs(x)-.03),y+.03) for x,y in pts],-1.08,.07,.012)

def tempest_rifle():
    j='wrR';z=-.28
    block('Fujin / storm rifle palm grip',j,'D',(0,-.48,-.18),(.16,.38,.18),.012)
    block('Fujin / storm rifle receiver',j,'S',(0,-.72,-.40),(.28,1.08,.34),.022)
    block('Fujin / emerald receiver',j,'P',(0,-.85,-.20),(.23,.59,.10),.014)
    disc('Fujin / staff barrel',j,'F',(0,-2.02,z),.095,1.55,'y',12)
    for y in (-1.38,-1.76,-2.14):
        disc('Fujin / gold barrel coil',j,'T',(0,y,z),.135,.10,'y',12)
        disc('Fujin / centred coil light',j,'G',(0,y,z),.138,.026,'y',12)
    disc('Fujin / muzzle gold collar',j,'T',(0,-2.77,z),.12,.16,'y',12)
    disc('Fujin / muzzle bore',j,'D',(0,-2.856,z),.079,.012,'y',12)

def tempest_details():
    global design_note
    design_note={
      'kamaitachi':'Art-sheet crescent samurai: swept gold blades, fitted lightning armor and mirrored skirt lames',
      'fujin':'Art-sheet wind samurai: sculpted wind ribbon, shoulder turbines, one storm rifle and retained snare',
      'raijin':'Art-sheet thunder defender: dark gold-edged cuirass, coiled gauntlets and retained drum halo'
    }[MODEL]
    scene['design_notes']=design_note;scene['sheet_polish']=3
    if MODEL=='raijin':
        block('Raijin / flat rear identification panel','chest','F',(0,1.24,-1.78),(.88,.78,.12),.025)
        for s in (-1,1):block('Raijin / halo side mounting bracket','chest','F',(s*1.29,1.60,-1.81),(.92,.14,.18),.016)
    w=(1.06,1.40,1.96)[role];f=(.60,.77,1.00)[role];back=(-.60,-.75,-1.02)[role]
    armor_loft('Tempest / emerald cuirass','chest','P',[(.04,w*.43,back*.78,f*.65),(.40,w*.71,back,f*.94),
               (1.02,w,back,f),(1.43,w*.92,back,f*.90),(1.66 if role<2 else 1.82,w*.65,back*.80,f*.63)])
    # The dark shield and centred bolt create a clear faction graphic. Gold
    # is confined to the perimeter so shading still reads on broad jade planes.
    pts=[(-w*.72,1.53),(0,1.46),(w*.72,1.53),(w*.60,.55),(0,.12),(-w*.60,.55)]
    faceted('Tempest / breastplate gold rim','chest','T',pts,f+.075,.18,.04)
    inner=[(x*.91,.78+(y-.78)*.87) for x,y in pts]
    faceted('Tempest / dark storm shield','chest','S',inner,f+.15,.13,.035)
    tempest_bolt('Tempest / centred chest bolt','chest',0,.83,f+.25,(.87,.95,1.04)[role],('S',))
    for s in (-1,1):
        faceted('Tempest / emerald clavicle','chest','P',[(s*w*.70,1.51),(s*w*.94,1.39),(s*w,1.04),(s*w*.77,.93)],f-.03,.16,.045)
    for n in range(3):
        sw=(.31,.42,.58)[role];y=.65-n*.24
        armor_loft('Tempest / encircling abdominal lame','spine','S',[(y-.10,sw*1.04,-sw*.94,sw),
                    (y+.06,sw*1.12,-sw*1.04,sw*1.05),(y+.14,sw*.94,-sw*.91,sw*.87)])
        faceted('Tempest / overlapping abdomen scale','spine','S',[(-sw,y+.14),(0,y+.07),(sw,y+.14),(sw*.79,y-.12),(0,y-.21),(-sw*.79,y-.12)],(.35,.47,.65)[role],.16,.045)
    bw=(.62,.75,.98)[role]
    block('Tempest / continuous waist belt','hips','S',(0,.24,.17),(bw*2,.22,1.00 if role<2 else 1.40),.04)
    # Four-petal knot seats against the belt at the pelvis midline.
    for s in (-1,1):
        faceted('Tempest / gold belt knot','hips','T',[(0,.28),(s*.15,.41),(s*.22,.26),(0,.10)],(.70,.73,.88)[role],.09,.025)
        sk='skirtL' if s==1 else 'skirtR'
        tempest_skirt(sk,(.31,.36,.47)[role],(1.37,1.42,1.30)[role],.10)
    tempest_skirt('skirtBack',(.54,.65,.87)[role],(1.41,1.46,1.35)[role],.10,True)

    for s in (1,-1):
        hip='hipL' if s==1 else 'hipR';knee='kneeL' if s==1 else 'kneeR'
        el='elL' if s==1 else 'elR';sh='shL' if s==1 else 'shR';ankle='ankleL' if s==1 else 'ankleR'
        h=dims['thigh'];tw=(.35,.42,.58)[role];tf=(.37,.44,.65)[role]
        armor_loft('Tempest / sculpted cuisse',hip,'P',[(-h+.18,tw*.62,-tf*.8,tf*.75),(-h*.67,tw*.88,-tf,tf),(-.43,tw,-tf,tf*.96),(-.19,tw*.72,-tf*.8,tf*.72)])
        # Outer armored skirt lames articulate with each upper leg.
        pts=[(s*.16,.27),(s*.47,.27),(s*.78,-.34),(s*.83,-.90),(s*.55,-.69),(s*.43,-1.00),(s*.24,-.43)]
        if role==2:pts=[(x*1.3,y) for x,y in pts]
        faceted('Tempest / side tasset gold edge',hip,'T',pts,.23,.13,.016)
        faceted('Tempest / side tasset jade',hip,'P',[(x*.94,y*.88) for x,y in pts],.30,.10,.025)
        h=dims['shin'];sw=(.43,.49,.66)[role];sf=(.43,.48,.63)[role]
        armor_loft('Tempest / sculpted greave',knee,'P',[(-h+.11,sw*.61,-sf*.76,sf*.83),(-h+.39,sw*.57,-sf*.82,sf*.96),
                   (-h*.48,sw,-sf,sf),(-.46,sw*.90,-sf*.94,sf*.91),(-.22,sw*.55,-sf*.72,sf*.67)])
        # Front lightning stays centred between the bevelled edges. Each leg
        # has mirrored geometry, and the existing calf bell mounts behind it.
        streak=tempest_streak('Tempest / centred greave lightning',knee,[(s*.04,-.52),(-s*.06,-.85),(s*.06,-1.15),(-s*.04,-h+.40)],sf+.04,.055)
        tempest_seat(streak,knee,('P',),.020)
        kw=(.24,.29,.39)[role]
        faceted('Tempest / knee dark socket',knee,'S',[(-kw,.26),(kw,.26),(kw*1.15,-.16),(0,-.51),(-kw*1.15,-.16)],sf-.03,.17,.02)
        faceted('Tempest / gold knee shield',knee,'T',[(-kw*.77,.31),(kw*.77,.31),(kw,-.08),(0,-.43),(-kw,-.08)],sf+.04,.15,.045)
        side_plate('Tempest / calf gold spur',knee,'T',[(-sf*.7,-.30),(-sf- .37,-.20),(-sf-.22,-.56),(-sf*.8,-.70)],s*sw*.65,.08,.008)
        if MODEL=='kamaitachi':tempest_turbine(knee,s,sw+.01,-.91,-.08,.19)
        tempest_skate(ankle)
        faceted('Tempest / green instep',ankle,'P',[(-.22,.12),(.22,.12),(.29,-.18),(0,-.35),(-.29,-.18)],.46,.16,.04)
        h=dims['foreArm'];ew=(.32,.37,.57)[role];ef=(.34,.38,.58)[role]
        armor_loft('Tempest / emerald bracer',el,'P',[(-h+.09,ew*.78,-ef*.88,ef*.90),(-h+.36,ew,-ef,ef),(-.40,ew*.94,-ef,ef),(-.16,ew*.62,-ef*.74,ef*.81)])
        if MODEL=='raijin':
            for y in (-h*.32,-h*.65):
                armor_loft('Raijin / gold gauntlet coil',el,'T',[(y-.055,ew*1.025,-ef*1.02,ef*1.025),(y+.055,ew*1.025,-ef*1.02,ef*1.025)])
                armor_loft('Raijin / fitted coil light',el,'G',[(y-.014,ew*1.035,-ef*1.03,ef*1.035),(y+.014,ew*1.035,-ef*1.03,ef*1.035)])
        else:
            pts=[(-ew*.64,-.26),(ew*.64,-.26),(ew*.72,-h+.18),(0,-h+.07),(-ew*.72,-h+.18)]
            ob=faceted('Tempest / bracer gold cuff',el,'T',pts,ef+.015,.075,.012)
            inner=[(x*.85,-.30+(y+.26)*.88) for x,y in pts]
            faceted('Tempest / bracer jade shield',el,'P',inner,ef+.06,.06,.02)
        if MODEL=='kamaitachi':
            x=s*.43
            pts=[(x-s*.11,-.29),(x+s*.15,.11),(x+s*.21,-.44),(x+s*.13,-2.24),(x,-2.96),(x-s*.09,-2.21)]
            faceted('Kamaitachi / forearm blade gold edge',el,'T',pts,.03,.15,.025)
            faceted('Kamaitachi / emerald blade',el,'P',[(x+(px-x)*.66,py*.93-.05) for px,py in pts],.10,.08,.018)
            ob=tempest_streak('Kamaitachi / blade energy edge',el,[(x+s*.095,-.40),(x+s*.065,-1.18),(x+s*.035,-2.13),(x,-2.65)],.18,.028)
            tempest_seat(ob,el,('T','P'),.018)
        # Each shoulder cover stays on the upper-arm joint, including victory.
        if MODEL=='fujin':
            disc('Fujin / rounded shoulder turbine armor',sh,'P',(s*.18,-.01,0),.57,.78,'x',16)
            tempest_turbine(sh,s,.58,-.04,0,.43)
            tempest_bolt('Fujin / shoulder lightning',sh,0,-.04,.60,.43)
        else:
            ww=.43 if role==0 else .54;top=.32;bottom=-.73 if role==0 else -.90
            pts=[(-ww,top),(ww,top+.09),(ww*1.10,bottom+.21),(0,bottom),(-ww*.98,bottom+.15)]
            faceted('Tempest / shoulder gold shield',sh,'T',pts,.46 if role==0 else .64,.22,.035)
            z=.53 if role==0 else .71
            faceted('Tempest / shoulder storm field',sh,'P',[(x*.85,(y+.1)*.86-.1) for x,y in pts],z,.13,.025)
            tempest_bolt('Tempest / centred shoulder bolt',sh,0,-.16,z+.12,.55 if role==0 else .65)
            if MODEL=='raijin':
                block('Raijin / lightning rod mounting rail',sh,'P',(s*.65,.29,0),(.24,.16,.94),.018)
        # Upper-arm armor meets the shoulder housing without covering elbows.
        ah=dims['upperArm'];aw=(.23,.26,.34)[role]
        faceted('Tempest / upper arm jade plate',sh,'P',[(-aw,-.36),(aw,-.36),(aw*.85,-ah+.26),(0,-ah+.12),(-aw*.85,-ah+.26)],(.29,.32,.42)[role],.12,.025)
    tempest_helmet()
    if MODEL=='kamaitachi':tempest_crescents()
    if MODEL=='fujin':tempest_wind_ring();tempest_rifle()
