"""October art-sheet pass, executed inside build_roster.py.

The eight supplied sheets resolve into one symmetric model each. No changes
to joint lengths, wheel contacts, animation targets or the six later units.
Armor and trim are solid overlapping parts; mirrored details are authored
with positive transforms. Source components remain reproducible inputs.
"""

def bounds(vs):
    return ([min(v[a] for v in vs) for a in range(3)],
            [max(v[a] for v in vs) for a in range(3)])

def sheet_skip(p):
    j=p['joint'];s=p['slot'];v=p['positions']
    lo=[min(v[a::3]) for a in range(3)];hi=[max(v[a::3]) for a in range(3)]
    h=hi[1]-lo[1]
    if MODEL=='daystar' and j.startswith('wing') and s!='K':return True
    if MODEL in ('razor','maul') and j=='head' and s=='G':return True
    if MODEL in ('daystar','stinger') and j=='wrR':return True
    if MODEL=='anubis':
        if j=='head' and s in ('P','F','D','G') and hi[1]<.60:return True
        if j.startswith('el') and s in ('T','G') and h>2:return True
        if j.startswith('knee') and s in ('S','T'):return True
    if MODEL=='sobek' and j.startswith('el'):
        # Replace the narrow fluted column with the sheet's broad armor bracer.
        if s=='P' and h>1:return True
        if s=='S' and abs((lo[0]+hi[0])/2)<.55 and h>.3:return True
        if s=='T' and -.9<(lo[1]+hi[1])/2<-.5:return True
    if j.startswith('knee') and MODEL!='sobek':
        # New layered knee shield replaces the old projecting wedge/ball cover.
        if hi[1]>.15 and h<1.25 and lo[2]>.10 and s in ('P','T'):return True
    return False

def sheet_shell(j,hw,widths):
    if j.startswith('knee'):
        target={'daystar':.46,'rampart':.62,'razor':.35,'stinger':.47,
                'maul':.61,'anubis':.44,'horus':.40,'sobek':.59}[MODEL]
        # Sections run from ankle toward knee. A broad upper calf, narrowed
        # ankle and planar ridge replace the uniform rectangular boot.
        profile=(.68,.76,1,.90,.62)
        if MODEL in ('rampart','maul','sobek'):profile=(.84,.90,1,.91,.65)
        if MODEL=='anubis':profile=(.76,.61,1,.81,.55)
        if MODEL=='horus':profile=(.85,.96,1,.87,.70)
        return max(hw,target),profile
    if j.startswith('hip') and j!='hips':
        return hw*1.08,(.70,.94,1,.92,.72)
    if j.startswith('el'):
        return hw*1.06,(.80,.92,1,.90,.76)
    return hw,widths

def faceted(name,j,slot,pts,z,depth=.14,ridge=.045):
    """Closed shield with a chamfered rim and broad, planar front facets."""
    n=len(pts);cx=sum(p[0] for p in pts)/n;cy=sum(p[1] for p in pts)/n
    inset=[(cx+(x-cx)*.83,cy+(y-cy)*.89) for x,y in pts]
    vs=[(x,y,z-depth*.65) for x,y in pts]+[(x,y,z) for x,y in pts]+[(x,y,z+depth*.35) for x,y in inset]+[(cx,cy,z+depth*.35+ridge)]
    faces=[tuple(range(n-1,-1,-1))]
    for k in range(n):
        t=(k+1)%n
        faces.extend([(k,t,n+t,n+k),(n+k,n+t,2*n+t,2*n+k),(2*n+k,2*n+t,3*n)])
    ob=mesh(name,j,slot,vs,faces,.009)
    for p in ob.data.polygons:p.use_smooth=False
    return ob

def side_plate(name,j,slot,pts,x,depth=.08,bevel=.012):
    # Profile points are (z,y), extruded through x. Used for fins and blades.
    vs=[(x+d,y,z) for d in (-depth/2,depth/2) for z,y in pts];n=len(pts)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,j,slot,vs,faces,bevel)

def fit_front(ob,j,slots=('P',),clearance=.018):
    """Seat a thin detail on the actual sloping surface below it."""
    targets=[]
    for target in meshes:
        if target==ob or target['joint']!=j or target['slot'] not in slots:continue
        target.data.calc_loop_triangles()
        for tri in target.data.loop_triangles:
            targets.append([(target.data.vertices[i].co.x,target.data.vertices[i].co.z,-target.data.vertices[i].co.y) for i in tri.vertices])
    front=max(-v.co.y for v in ob.data.vertices)
    for vert in ob.data.vertices:
        x,y=vert.co.x,vert.co.z;hits=[]
        for a,b,c in targets:
            den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(den)<1e-9:continue
            u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den
            v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den
            if min(u,v,1-u-v)>-1e-5:hits.append(u*a[2]+v*b[2]+(1-u-v)*c[2])
        if not hits:raise RuntimeError('Detail misses its armor: '+ob.name)
        depth=front+vert.co.y
        vert.co.y=-(max(hits)+clearance-depth)
    ob.data.update()

def armor_loft(name,j,slot,rings):
    # (height, half width, back, front); consistent eight-vertex cross section.
    vs=[]
    for y,w,b,f in rings:
        c=min(w*.28,(f-b)*.2)
        vs.extend([(-w+c,y,f),(w-c,y,f),(w,y,f-c),(w,y,b+c),
                   (w-c,y,b),(-w+c,y,b),(-w,y,b+c),(-w,y,f-c)])
    n=len(rings);faces=[tuple(range(7,-1,-1)),tuple(range((n-1)*8,n*8))]
    faces += [(k*8+i,k*8+(i+1)%8,(k+1)*8+(i+1)%8,(k+1)*8+i) for k in range(n-1) for i in range(8)]
    ob=mesh(name,j,slot,vs,faces,.015)
    for p in ob.data.polygons:p.use_smooth=False
    return ob

def snout(name,slot,sections):
    # z, width, bottom, top: a connected six-sided skull and muzzle.
    vs=[]
    for z,w,b,t in sections:vs.extend([(-w,b,z),(w,b,z),(w,t-.04,z),(w*.55,t,z),(-w*.55,t,z),(-w,t-.04,z)])
    n=len(sections);faces=[tuple(range(5,-1,-1)),tuple(range((n-1)*6,n*6))]
    faces += [(k*6+i,k*6+(i+1)%6,(k+1)*6+(i+1)%6,(k+1)*6+i) for k in range(n-1) for i in range(6)]
    ob=mesh(name,'head',slot,vs,faces,.012)
    for p in ob.data.polygons:p.use_smooth=False
    return ob

def rifle():
    j='wrR';z=-.28;end=-2.32 if MODEL=='daystar' else -2.86
    # Grip sits inside the curled fingers. Receiver remains behind the palm;
    # both views therefore show the same handed weapon, rather than a switch.
    block('Carbine / palm grip',j,'D',(0,-.52,-.19),(.16,.35,.17),.012)
    block('Carbine / receiver',j,'F',(0,-.70,z-.13),(.29,1.16,.37),.025)
    block('Carbine / buttstock',j,'K',(0,.02,z-.14),(.23,.32,.30),.025)
    faceted('Carbine / faction housing',j,'S',[(-.17,-.38),(.17,-.38),(.17,-.94),(.10,-1.12),(-.13,-1.12)],z+.05,.12,.01)
    disc('Carbine / barrel',j,'D',(0,(-1.16+end+.10)/2,z),.09,-1.16-end-.10,'y',12)
    disc('Carbine / muzzle collar',j,'T' if MODEL=='daystar' else 'F',(0,end+.10,z),.125,.19,'y',12)
    disc('Carbine / dark bore',j,'D',(0,end+.002,z),.085,.012,'y',12)
    block('Carbine / side sight',j,'G',(-.18,-.70,z+.01),(.025,.19,.025),0)
    for s in (-1,1):block('Carbine / grip guard',j,'F',(s*.135,-.55,-.20),(.035,.35,.15),.008)

def sheet_details():
    global design_note
    notes={
      'daystar':'Art-sheet racing armor, paired swept fins, layered knees and seated carbine',
      'rampart':'Art-sheet heavy greaves, angular knee shields and reinforced gauntlets',
      'razor':'Art-sheet tapered blade carrier with faceted shin armor and twin eye sensors',
      'stinger':'Art-sheet angular mask, paired visor sensors and consistent rifle grip',
      'maul':'Art-sheet heavy brawler with layered gauntlets, jaw guard and broad boots',
      'anubis':'Art-sheet jackal mask, gold-edged khopesh blades and sculpted greaves',
      'horus':'Art-sheet falcon armor, gold knee shields and seated staff-blaster grip',
      'sobek':'Art-sheet crocodile with broad bracers, shoulder medallions and layered boots'
    }
    design_note=notes[MODEL];scene['design_notes']=design_note;scene['sheet_polish']=1
    if MODEL in ('daystar','stinger'):rifle()
    # Matched limb details. Explicit mirrored coordinates preserve the handed
    # anatomy already used by the hands and by the runtime animation rig.
    for s in (1,-1):
        knee='kneeL' if s==1 else 'kneeR';el='elL' if s==1 else 'elR'
        sh='shL' if s==1 else 'shR';ankle='ankleL' if s==1 else 'ankleR'
        if MODEL!='sobek':
            w=.24 if role==0 else .32 if role==1 else .39
            z=.34 if MODEL=='anubis' else .43 if role==0 else .52 if role==1 else .77
            pts=[(-w*.67,.32),(w*.67,.32),(w,.02),(w*.67,-.38),(0,-.49),(-w*.67,-.38),(-w,.02)]
            faceted('Sheet / knee socket',knee,'D',[(x*1.10,y*1.08) for x,y in pts],z-.06,.18,.015)
            slot='T' if MODEL in ('anubis','horus','razor','stinger','maul') else 'P'
            faceted('Sheet / knee shield',knee,slot,pts,z,.18,.05)
        if MODEL in ('daystar','rampart'):
            # The front blue strip remains legible on the large white shin.
            if MODEL=='rampart':
                inlay=plate('Sheet / blue shin inlay',knee,'S',[(-.11,-.47),(.11,-.47),(.095,-1.40),(-.095,-1.40)],.895,.045,.009)
                fit_front(inlay,knee)
            # Pod intake rim and split ankle armor carry the racing lineage.
            if MODEL=='daystar':
                x=s*.44
                faceted('Sheet / shoulder intake bezel',sh,'P',[(x-.15,.08),(x+.15,.08),(x+.15,.36),(x-.15,.36)],.635,.06,0)
                block('Sheet / shoulder intake throat',sh,'D',(x,.22,.662),(.20,.20,.065),.012)
            faceted('Sheet / instep',ankle,'P',[(-.24,.10),(.24,.10),(.32,-.14),(.23,-.26),(-.23,-.26),(-.32,-.14)],.53,.17,.035)
        if MODEL=='anubis':
            # Long curved blade seen edge-on in the front view; gold perimeter
            # and copper inner face appear as the arm turns, like the sheet.
            pts=[(-.12,-.08),(.35,-.13),(.61,-.55),(.58,-2.35),(.25,-3.30),(.09,-3.49),(.12,-2.65),(-.06,-.72)]
            side_plate('Anubis / khopesh gold edge',el,'T',pts,s*.36,.12)
            inset=[(.08,-.28),(.32,-.32),(.46,-.65),(.43,-2.30),(.24,-2.98),(.22,-2.52),(.12,-.78)]
            side_plate('Anubis / khopesh copper face',el,'S',inset,s*.426,.025,.006)
            side_plate('Anubis / blade energy seam',el,'G',[(.48,-.62),(.51,-.65),(.48,-2.25),(.45,-2.30)],s*.43,.025,0)
            # New rear shell supplies depth and a calf ridge, without moving
            # the jet outlet or interfering with the ankle's rotation.
            side_plate('Anubis / calf copper fin',knee,'S',[(-.24,-.52),(-.65,-.64),(-.71,-1.23),(-.35,-1.57)],s*.36,.13)
            side_plate('Anubis / calf gold rim',knee,'T',[(-.65,-.64),(-.70,-.70),(-.76,-1.23),(-.71,-1.29)],s*.36,.15,.006)
            # Twin claws are solid parts seated on the skate toe.
            for x in (-.22,.22):
                side_plate('Anubis / toe claw',ankle,'T',[(.55,-.12),(1.13,-.20),(1.24,-.39),(.99,-.37),(.68,-.27)],x,.12)
        if MODEL=='horus':
            # Small leg/chest armor fittings echo the gold feather caps.
            block('Horus / shin termination',knee,'T',(0,-1.83,.34),(.23,.08,.09),.016)
            for x in (-.20,.20):block('Horus / bracer stud',el,'T',(x,-.25,.34),(.10,.09,.07),.01)
        if MODEL in ('razor','stinger','maul'):
            # A narrow central keel and flank facets read clearly at race scale.
            h=dims['shin'];w=.15 if role==0 else .20
            if MODEL=='razor':
                faceted('Razor / greave keel',knee,'P',[(-w,-.32),(w,-.32),(.10,-h+.37),(0,-h+.19),(-.10,-h+.37)],.37,.12,.055)
            if MODEL=='stinger':
                faceted('Stinger / red bracer housing',el,'S',[(s*.27,-.35),(s*.46,-.43),(s*.43,-1.27),(s*.26,-1.34)],.23,.15,.015)
            if MODEL=='maul':
                for y in (-.80,-1.10):
                    block('Maul / gauntlet armor seam',el,'D',(0,y,.614),(.84,.04,.025),.004)
                # Seat the reference spikes with visible round bases.
                for y in (-.40,-.95,-1.50):disc('Maul / spike root',el,'F',(s*.64,y,0),.11,.075,'x',12)
        if MODEL=='sobek':
            armor_loft('Sobek / broad bracer',el,'P',[(-1.59,.53,-.54,.56),(-1.39,.50,-.52,.58),(-.55,.58,-.55,.62),(-.22,.61,-.58,.61),(-.13,.51,-.48,.50)])
            faceted('Sobek / bracer gold frame',el,'T',[(-.17,-.44),(.17,-.44),(.15,-1.33),(-.15,-1.33)],.60,.085,.005)
            faceted('Sobek / bracer copper inlay',el,'S',[(-.10,-.51),(.10,-.51),(.09,-1.26),(-.09,-1.26)],.642,.035,0)
            disc('Sobek / pauldron gold medallion',sh,'T',(s*.48,.10,.65),.16,.09,'z',16)
            disc('Sobek / pauldron raised centre',sh,'T',(s*.48,.10,.70),.105,.04,'z',16)
    if MODEL=='daystar':
        for s in (1,-1):
            j='wingL' if s==1 else 'wingR'
            # One physical swept fin per side; the AI views disagree about
            # its inclination. Keep a centre dorsal stabilizer plus this pair.
            fin=side_plate('Daystar / paired swept fin',j,'S',[(.06,.08),(-.35,-.09),(-2.05,.44),(-1.92,.60),(-.15,.24)],0,.16)
            tip=side_plate('Daystar / gold fin tip',j,'T',[(-1.73,.51),(-1.92,.60),(-2.05,.44),(-1.77,.36)],0,.18)
            light=side_plate('Daystar / fin light',j,'G',[(-.32,.10),(-1.61,.43),(-1.57,.36),(-.35,.04)],s*.092,.018,0)
            for ob in (fin,tip,light):
                for v in ob.data.vertices:
                    z=-v.co.y;v.co.x+=s*max(0,-z)*.16
        faceted('Daystar / chin plate','head','P',[(-.25,.22),(.25,.22),(.17,-.02),(0,-.08),(-.17,-.02)],.45,.10,.018)
    if MODEL=='rampart':
        # Retain the three tall crest blades and strengthen the helmet's brow.
        for s in (-1,1):
            faceted('Rampart / white brow ridge','head','P',[(s*.03,.62),(s*.42,.74),(s*.45,.65),(s*.07,.53)],.54,.065,0)
    if MODEL=='razor':
        # The sheet shows paired eyes, not a randomly offset single lamp.
        for s in (-1,1):block('Razor / balanced eye sensor','head','G',(s*.13,-.04,1.025),(.115,.055,.022),0)
    if MODEL=='stinger':
        block('Stinger / neck spindle','head','F',(0,.07,.04),(.32,.42,.34),.025)
        snout('Stinger / helmet','P',[(-.30,.31,.16,.71),(.27,.35,.14,.76),(.48,.28,.20,.66)])
        faceted('Stinger / brow','head','P',[(-.37,.73),(-.26,.82),(.26,.82),(.37,.73),(.30,.60),(-.30,.60)],.48,.14,.015)
        faceted('Stinger / visor recess','head','D',[(-.29,.64),(0,.59),(.29,.64),(.26,.51),(0,.47),(-.26,.51)],.555,.075,0)
        for s in (-1,1):
            plate('Stinger / paired eye','head','G',[(s*.025,.568),(s*.245,.607),(s*.225,.546),(s*.055,.519)],.610,.025,.002)
        snout('Stinger / angular face mask','P',[(.32,.25,.13,.48),(.58,.22,.10,.47),(.81,.12,.06,.35),(.86,.055,.04,.23)])
        for s in (-1,1):
            faceted('Stinger / cheek guard','head','K',[(s*.25,.44),(s*.36,.33),(s*.22,.08),(s*.12,.11)],.47,.15,.02)
            plate('Stinger / crimson cheek vent','head','S',[(s*.19,.23),(s*.29,.28),(s*.27,.21),(s*.18,.17)],.575,.035,.003)
    if MODEL=='maul':
        faceted('Maul / lower jaw guard','head','P',[(-.28,.28),(.28,.28),(.30,.06),(.19,-.03),(-.19,-.03),(-.30,.06)],.59,.12,.025)
        block('Maul / continuous visor','head','G',(0,.445,.675),(.59,.052,.022),0)
    if MODEL=='anubis':
        snout('Anubis / jackal skull','P',[(-.34,.28,.0,.48),(.22,.35,.0,.59),(.46,.33,.06,.53)])
        snout('Anubis / tapered muzzle','P',[(.29,.26,.045,.37),(.68,.20,.045,.32),(1.04,.145,.08,.28),(1.11,.12,.10,.24)])
        snout('Anubis / jaw line','F',[(.35,.21,.005,.065),(1.04,.13,.055,.105)])
        faceted('Anubis / black nose','head','D',[(-.12,.24),(.12,.24),(.10,.14),(0,.10),(-.10,.14)],1.118,.055,.012)
        for s in (-1,1):
            plate('Anubis / eye surround','head','D',[(s*.10,.44),(s*.29,.47),(s*.29,.35),(s*.15,.32)],.470,.04,.003)
            plate('Anubis / gold eye','head','G',[(s*.15,.401),(s*.26,.422),(s*.25,.375),(s*.17,.366)],.495,.018,0)
            faceted('Anubis / cheek plane','head','P',[(s*.24,.30),(s*.40,.23),(s*.29,-.01),(s*.14,.03)],.30,.20,.025)
        faceted('Anubis / crown seal','head','T',[(-.13,.59),(.13,.59),(.17,.51),(0,.47),(-.17,.51)],.24,.10,.005)
    if MODEL=='horus':
        # Preserve the hooked beak, add the lighter ridge visible in the art.
        ridge=faceted('Horus / beak ridge','head','K',[(-.07,.78),(.07,.78),(.10,.56),(0,.21),(-.10,.56)],.815,.085,.055)
        fit_front(ridge,'head',('F',),.035)
        block('Horus / staff palm grip','wrR','D',(0,-.52,-.18),(.17,.34,.16),.01)
    if MODEL=='sobek':
        for s in (-1,1):
            disc('Sobek / cheek hinge','head','T',(s*.93,.42,-.16),.17,.10,'x',12)
            # Eyelid guards are bilateral even where the illustration differs.
            block('Sobek / gold eyelid','head','T',(s*.56,1.43,.235),(.27,.055,.10),.015)
