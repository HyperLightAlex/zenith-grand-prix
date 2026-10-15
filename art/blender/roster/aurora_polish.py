"""Aurora's updated concept sheets, executed in the roster authoring context.

Keep the original rigid skeleton and equipment anchors. Armor is mirrored;
Longbow deliberately keeps a right-hand rifle and left snare launcher, not
the two forearm swords hallucinated by the supplied generated turnaround.
"""

def aurora_skip(p):
    j=p['joint'];slot=p['slot'];v=p['positions']
    lo=[min(v[a::3]) for a in range(3)];hi=[max(v[a::3]) for a in range(3)]
    height=hi[1]-lo[1];cx=(lo[0]+hi[0])/2
    if j=='chest':
        if slot=='P':return True
        if slot in ('S','T','G') and lo[2]>0:return True
        if slot in ('S','T') and height<.7 and hi[2]>.5 and hi[0]-lo[0]>1.3:return True
    if j.startswith('hip') and j!='hips' and slot in ('P','S'):return True
    if j.startswith('knee') and slot in ('P','S','T'):return True
    if j.startswith('ankle') and slot in ('P','S','T'):return True
    if j.startswith('el'):
        if slot=='P':return True
        if MODEL=='seraph' and slot in ('S','T','G'):return True
        if slot=='S' and abs(cx)<.4:return True
    if MODEL=='longbow' and j=='wrR':return True
    if MODEL=='seraph':
        if j.startswith('wing') and slot!='K':return True
        if j=='hips' and slot in ('P','S','T','G') and lo[1]<-.8 and abs(cx)<.4:return True
        if j=='head' and slot in ('S','D'):return True
        if j=='head' and slot=='G' and lo[2]>0:return True
        if j=='head' and slot=='T' and lo[2]>.3:return True
    if j.startswith('skirt') and slot in ('P','S'):return True
    return False

def aurora_sigil(j,x,y,z,k=1):
    # Low-relief sword and paired feathers: readable geometry without a
    # decal floating above a newly sculpted cuirass.
    start=len(meshes)
    plate('Aurora / sword sigil',j,'P',[(x-.035*k,y+.30*k),(x,y+.42*k),(x+.035*k,y+.30*k),(x+.025*k,y-.25*k),(x,y-.37*k),(x-.025*k,y-.25*k)],z,.025,.003)
    block('Aurora / sword guard',j,'T',(x,y+.04*k,z+.008),(.29*k,.035*k,.027),.003)
    for s in (-1,1):
        for n in range(3):
            pts=[(x+s*.06*k,y+(.13-n*.075)*k),(x+s*(.24-n*.035)*k,y+(.28-n*.12)*k),
                 (x+s*(.20-n*.03)*k,y+(.09-n*.09)*k),(x+s*.06*k,y+(.04-n*.075)*k)]
            plate('Aurora / sigil feather',j,'P',pts,z,.023,.002)
    for ob in meshes[start:]:
        # Give the relief vertices across the cuirass ridge. A single broad
        # face between two projected corners would cut through that ridge.
        bm=bmesh.new();bm.from_mesh(ob.data)
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
        bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=2,use_grid_fill=True)
        bm.to_mesh(ob.data);bm.free();ob.data.update()
        fit_front(ob,j,slots=('S',),clearance=.020)

def aurora_banner(j,cx,top,bottom,w,z,reverse=False):
    pts=[(cx-w,top),(cx+w,top),(cx+w*.94,bottom+.27),(cx,bottom),(cx-w*.94,bottom+.27)]
    objs=[plate('Aurora / tabard silver border',j,'S',pts,z,.085,.014),
          plate('Aurora / tabard violet field',j,'P',[(cx+(x-cx)*.80,top-.075+(y-top)*.92) for x,y in pts],z+.052,.04,.009)]
    # Narrow metal tip and perimeter separate the violet field from armor.
    for s in (-1,1):
        objs.append(plate('Aurora / tabard piping',j,'T',[(cx+s*w*.83,top-.07),(cx+s*w*.89,top-.07),
                     (cx+s*w*.83,bottom+.30),(cx,bottom+.08),(cx,bottom+.14),(cx+s*w*.77,bottom+.34)],z+.077,.018,.002))
    if reverse:
        for ob in objs:
            for v in ob.data.vertices:v.co.y*=-1
            bm=bmesh.new();bm.from_mesh(ob.data)
            bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
            bm.to_mesh(ob.data);bm.free();ob.data.update()

def aurora_sabaton(j):
    length=(1.60,1.80,2.15)[role];w=(.30,.35,.52)[role]
    base=-dims['ankleY']+.36
    sections=[(-.68,w*.77,base+.18),(-.16,w,base+.48),(.36,w*.96,base+.45),
              (length*.52,w*.73,base+.31),(length*.84,w*.43,base+.18),(length,.035,base+.05)]
    vs=[]
    for z,width,top in sections:
        vs.extend([(-width,base,z),(width,base,z),(width*.94,top-.085,z),
                   (width*.38,top,z),(-width*.38,top,z),(-width*.94,top-.085,z)])
    faces=[tuple(range(5,-1,-1)),tuple(range(30,36))]+[(n*6+i,n*6+(i+1)%6,(n+1)*6+(i+1)%6,(n+1)*6+i) for n in range(5) for i in range(6)]
    shell=mesh('Aurora / sculpted pearl sabaton',j,'S',vs,faces,.013)
    for p in shell.data.polygons:p.use_smooth=False
    for s in (-1,1):
        ribbon=[]
        for z,width,top in sections[:-1]:
            ribbon.extend([(s*width*.42,top-.004,z),(s*width*.84,top-.062,z)])
        faces=[(n*2,n*2+1,n*2+3,n*2+2) for n in range(4)]
        if s==1:faces=[tuple(reversed(f)) for f in faces]
        mesh('Aurora / violet sabaton flank',j,'P',ribbon,faces,0)

def aurora_rifle():
    # One ranged weapon, with an open dark bore at the original muzzle anchor.
    j='wrR';z=-.28
    block('Longbow / rifle palm grip',j,'D',(0,-.48,-.18),(.16,.38,.18),.012)
    block('Longbow / rifle receiver',j,'F',(0,-.76,-.44),(.27,1.12,.35),.024)
    faceted('Longbow / pearl rifle housing',j,'S',[(-.19,-.56),(.19,-.56),(.18,-1.16),(.10,-1.34),(-.10,-1.34)],-.24,.14,.025)
    block('Longbow / rifle violet spine',j,'P',(0,-.89,-.19),(.14,.54,.05),.01)
    disc('Longbow / rifle barrel',j,'S',(0,-2.01,z),.095,1.54,'y',12)
    for y in (-1.42,-1.93,-2.61):disc('Longbow / rifle barrel collar',j,'T',(0,y,z),.115,.07,'y',12)
    disc('Longbow / muzzle collar',j,'P',(0,-2.78,z),.13,.16,'y',12)
    disc('Longbow / muzzle bore',j,'D',(0,-2.856,z),.085,.012,'y',12)
    for s in (-1,1):block('Longbow / receiver light',j,'G',(s*.162,-.89,-.24),(.022,.29,.022),0)

def aurora_details():
    global design_note
    design_note={
      'seraph':'Art-sheet winged duellist: pearl cuirass, five-feather fans and paired rapier bracers',
      'longbow':'Art-sheet knight archer: long surcoat, sculpted armor and one ranged rifle; no paired blades',
      'paladin':'Art-sheet crowned defender: broad pearl breastplate, shield shoulders and heavy greaves'
    }[MODEL]
    scene['design_notes']=design_note;scene['sheet_polish']=2
    # The power unit, nozzle geometry and shoulder couplings stay in place.
    w=(1.02,1.36,1.92)[role];f=(.59,.78,1.02)[role];b=(-.58,-.73,-.98)[role]
    armor_loft('Aurora / ridged cuirass','chest','P',[(.10,w*.45,b*.80,f*.68),(.45,w*.70,b,f*.94),
               (1.04,w,b,f),(1.40,w*.93,b,f*.91),(1.64,w*.66,b*.79,f*.67)])
    if MODEL=='seraph':
        pts=[(-.27,1.52),(.27,1.52),(.76,.96),(.58,.46),(0,-.06),(-.58,.46),(-.76,.96)]
        faceted('Seraph / pearl heart cuirass','chest','S',pts,f+.07,.20,.10)
        aurora_sigil('chest',0,.80,f+.27,.88)
        # Swept violet clavicles bracket the white centre and remain clear
        # of the neck and rotating shoulder joints.
        for s in (-1,1):
            faceted('Seraph / violet clavicle','chest','P',[(s*.33,1.51),(s*.91,1.40),(s*1.02,1.08),(s*.73,.93)],f+.05,.12,.03)
            plate('Seraph / clavicle light','chest','G',[(s*.43,1.39),(s*.81,1.20),(s*.82,1.16),(s*.44,1.35)],f+.14,.018,0)
    else:
        pts=[(-w*.72,.94),(0,1.01),(w*.72,.94),(w*.59,.40),(w*.29,.08),(-w*.29,.08),(-w*.59,.40)]
        faceted('Aurora / pearl lower breastplate','chest','S',pts,f+.06,.15,.07)
        aurora_sigil('chest',0,.53,f+.22,1 if role==1 else 1.05)
        for s in (-1,1):
            plate('Aurora / breastplate piping','chest','T',[(0,1.025),(s*w*.72,.955),(s*w*.72,.93),(0,1.0)],f+.13,.02,.002)
        # Longbow's front shoulder stoles echo his rear cape fins. They stay
        # within the chest envelope, clear of the upper-arm swing.
        if MODEL=='longbow':
            for s in (-1,1):
                aurora_banner('chest',s*1.02,1.54,.13,.22,f+.13)
                disc('Longbow / stole clasp','chest','T',(s*1.02,1.43,f+.21),.065,.045,'z',12)
            aurora_rifle()
    # Layered torso armor conceals the old cylindrical waist without replacing
    # the continuous articulated mechanical shaft beneath it.
    for n in range(3):
        w0=(.32,.43,.58)[role];y=.65-n*.23
        faceted('Aurora / overlapping abdominal lame','spine','P' if n!=1 else 'S',
                [(-w0,y+.12),(w0,y+.12),(w0*.87,y-.10),(0,y-.19),(-w0*.87,y-.10)],(.40,.58,.73)[role],.13,.025)

    for s in (1,-1):
        hip='hipL' if s==1 else 'hipR';knee='kneeL' if s==1 else 'kneeR'
        el='elL' if s==1 else 'elR';sh='shL' if s==1 else 'shR';ankle='ankleL' if s==1 else 'ankleR'
        h=dims['thigh'];w0=(.35,.41,.55)[role];f0=(.36,.42,.54)[role]
        armor_loft('Aurora / cuisse','hipL' if s==1 else 'hipR','P',
                   [(-h+.22,w0*.72,-f0*.85,f0),(-h*.65,w0*.89,-f0,f0),(-.43,w0,-f0,f0),(-.17,w0*.77,-f0*.8,f0*.85)])
        faceted('Aurora / pearl thigh plate',hip,'S',[(-w0*.75,-.30),(w0*.75,-.30),(w0*.69,-h+.41),(0,-h+.22),(-w0*.69,-h+.41)],f0+.025,.10,.045)
        # A pointed outer hip plate follows the leg rather than floating on
        # the pelvis when the skater crouches or lifts a knee.
        faceted('Aurora / hip tasset',hip,'S',[(s*.26,.22),(s*.58,.15),(s*.77,-.85),(s*.39,-.57)],.17,.16,.025)
        faceted('Aurora / hip tasset field',hip,'P',[(s*.35,.12),(s*.52,.06),(s*.66,-.65),(s*.44,-.50)],.25,.06,.01)
        h=dims['shin'];w0=(.45,.51,.68)[role];f0=(.42,.48,.65)[role]
        armor_loft('Aurora / sculpted greave',knee,'P',[(-h+.12,w0*.53,-f0*.72,f0*.83),(-h+.44,w0*.59,-f0*.82,f0),
                   (-h*.46,w0,-f0,f0),(-.44,w0*.87,-f0*.93,f0),(-.25,w0*.56,-f0*.72,f0*.89)])
        pts=[(-w0*.42,-.31),(-w0*.79,-.55),(-w0*.90,-h*.47),(-w0*.50,-h+.40),(-.09,-h+.18),(0,-h+.26),(-w0*.22,-h*.50),(-w0*.18,-.58)]
        for edge in (-1,1):
            faceted('Aurora / pearl greave edge',knee,'S',[(edge*x,y) for x,y in pts],f0+.015,.10,.02)
        capw=(.28,.34,.45)[role]
        faceted('Aurora / knee socket',knee,'D',[(-capw,.25),(capw,.25),(capw*1.1,-.05),(0,-.48),(-capw*1.1,-.05)],f0-.05,.18,.02)
        faceted('Aurora / pointed poleyn',knee,'S',[(-capw*.72,.33),(capw*.72,.33),(capw*1.08,-.04),(0,-.48),(-capw*1.08,-.04)],f0+.03,.19,.065)
        # Pearl bracer over a continuous violet sleeve; wrist and elbow gaps
        # stay articulated and the hand remains on the correct arm.
        h=dims['foreArm'];ew=(.31,.37,.55)[role];ef=(.32,.37,.59)[role]
        armor_loft('Aurora / vambrace',el,'P',[(-h+.11,ew*.74,-ef*.9,ef),(-h+.33,ew*.92,-ef,ef),(-.43,ew,-ef,ef),(-.18,ew*.63,-ef*.75,ef*.86)])
        faceted('Aurora / pearl bracer shield',el,'S',[(-ew*.78,-.28),(0,-.46),(ew*.78,-.28),(ew*.90,-h+.22),(0,-h+.08),(-ew*.90,-h+.22)],ef+.02,.10,.035)
        if MODEL=='seraph':
            # Two rapier blades belong only to the forward. They originate
            # at the outer bracer, behind the hand, not in the wrist joint.
            x=s*.39
            plate('Seraph / rapier pearl edge',el,'S',[(x-s*.10,-.35),(x+s*.11,-.24),(x+s*.10,-2.45),(x,-3.02),(x-s*.07,-2.40)],.02,.12,.009)
            plate('Seraph / rapier violet core',el,'P',[(x-s*.045,-.41),(x+s*.06,-.36),(x+s*.048,-2.43),(x,-2.81),(x-s*.028,-2.40)],.095,.035,.004)
            block('Seraph / blade energy edge',el,'G',(x,-1.77,.122),(.022,1.26,.02),0)
            disc('Seraph / rapier guard',el,'T',(x,-1.34,.05),.23,.10,'y',16)
            # Upper-arm lames pick up the more angular swept-shoulder motif.
            faceted('Seraph / shoulder crest',sh,'P',[(s*-.27,.31),(s*.25,.46),(s*.70,.23),(s*.66,-.08),(s*.10,.03)],.37,.18,.04)
        # Silver instep and swept heel spur keep the roller hardware visible.
        aurora_sabaton(ankle)
        faceted('Aurora / instep plate',ankle,'S',[(-.23,.12),(.23,.12),(.30,-.18),(0,-.34),(-.30,-.18)],.47,.16,.04)
        side_plate('Aurora / heel spur',ankle,'S',[(-.42,-.10),(-1.01,.10),(-.84,-.28),(-.43,-.36)],s*.24,.13,.012)
        if MODEL=='paladin':
            faceted('Paladin / violet gauntlet face',el,'P',[(-.38,-.35),(.38,-.35),(.42,-1.30),(-.42,-1.30)],.69,.11,.035)
            block('Paladin / pearl wrist cuff',el,'S',(0,-1.42,.58),(.86,.19,.22),.025)
    # Split panels use the existing skirt joints so they follow the legs.
    if MODEL=='seraph':
        for s in (-1,1):
            aurora_banner('skirtL' if s==1 else 'skirtR',s*.19,.25,-1.88,.19,.49)
        aurora_banner('skirtBack',0,.22,-1.80,.37,.46,True)
        # Replace all three old narrow fins with a wider articulated feather
        # fan, with identical roots and mirrored positive-scale geometry.
        for s in (-1,1):
            j='wingL' if s==1 else 'wingR'
            block('Seraph / feather fan hinge',j,'F',(0,-.12,-.05),(.23,.67,.25),.025)
            fan_start=len(meshes)
            for n,(angle,length) in enumerate(((55,1.90),(27,1.68),(2,1.48),(-28,1.55),(-53,1.85))):
                a=math.radians(angle)
                def fan(x,y):return (s*(x*math.cos(a)-y*math.sin(a)),x*math.sin(a)+y*math.cos(a)-.09*n)
                pts=[fan(0,-.09),fan(0,.09),fan(length*.70,.20),fan(length,.035),fan(length*.66,-.15)]
                z=-.11-.085*n
                faceted('Seraph / pearl feather '+str(n+1),j,'S',pts,z,.11,.018)
                inner=[fan(.12,-.065),fan(length*.68,-.105),fan(length*.91,.02),fan(length*.66,.065)]
                plate('Seraph / violet feather inlay',j,'P',inner,z+.064,.025,.003)
                plate('Seraph / rear violet feather inlay',j,'P',inner,z-.078,.025,.003)
                # Restrained strip at the root, not a broad luminous billboard.
                plate('Seraph / feather light',j,'G',[fan(.25,.015),fan(length*.57,.07),fan(length*.57,.045),fan(.25,-.01)],z+.085,.015,0)
            # Sweep the entire fan rearward, like the side view. Rotations
            # preserve winding; each mirrored fan has positive transforms.
            turn=Matrix.Rotation(s*.35,3,'Y')
            for ob in meshes[fan_start:]:
                for vert in ob.data.vertices:
                    v=turn@Vector((vert.co.x,vert.co.z,-vert.co.y));vert.co=cv(v)
                ob.data.update()
        # Tall central crest and a sharp pearl face turn the old bowl-shaped
        # helm into a knight's pointed helmet while retaining its halo.
        side_plate('Seraph / tall crown blade','head','S',[(.15,.71),(.08,1.68),(-.12,1.15),(-.40,.76)],0,.075,.006)
        faceted('Seraph / pearl face','head','S',[(-.29,.51),(.29,.51),(.25,.10),(0,-.16),(-.25,.10)],.51,.19,.045)
        faceted('Seraph / visor recess','head','D',[(-.30,.57),(0,.52),(.30,.57),(.27,.44),(0,.41),(-.27,.44)],.57,.05,0)
        for s in (-1,1):
            plate('Seraph / paired visor','head','G',[(s*.018,.499),(s*.263,.541),(s*.245,.488),(s*.02,.450)],.609,.018,0)
            faceted('Seraph / temple wing','head','S',[(s*.27,.49),(s*.61,.86),(s*.50,.41),(s*.31,.19)],.10,.14,.02)
    else:
        # Longbow's split surcoat and Paladin's shorter armored fauld preserve
        # their own motion pivots rather than covering the thighs rigidly.
        for s in (-1,1):
            aurora_banner('skirtL' if s==1 else 'skirtR',0,.04,-(1.85 if MODEL=='longbow' else 1.34),.29 if role==1 else .39,.09)
        aurora_banner('skirtBack',0,.04,-(1.95 if MODEL=='longbow' else 1.39),.57 if role==1 else .70,.09,True)
        if MODEL=='longbow':
            faceted('Longbow / pointed pearl mask','head','S',[(-.35,.55),(.35,.55),(.27,.22),(0,-.09),(-.27,.22)],.57,.10,.035)
        if MODEL=='paladin':
            # Keep the pierced great helm and original shield geometry; add
            # a narrow bridge so the crown reads as a continuous metal rim.
            block('Paladin / brow bridge','head','S',(0,1.16,.79),(.73,.065,.08),.012)
