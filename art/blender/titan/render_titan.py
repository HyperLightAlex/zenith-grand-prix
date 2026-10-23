"""Render Phase1 review only. Does not save cameras, visibility or poses to .blend."""
import bpy,math,sys,json
from pathlib import Path
from mathutils import Vector,Matrix
HERE=Path(bpy.data.filepath).resolve().parent
OUT=HERE/'previews/raw';OUT.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO';scene.display.shading.studio_light='paint.sl'
scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_shadows=False
scene.display.shading.show_cavity=False
scene.display.shading.show_object_outline=False
scene.display.shading.show_specular_highlight=False
scene.render.film_transparent=True
scene.view_settings.view_transform='Standard'
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.resolution_percentage=100
scene.display.render_aa='32'
camera=bpy.data.cameras.new('review-orthographic');cam=bpy.data.objects.new('review-orthographic',camera)
scene.collection.objects.link(cam);scene.camera=cam
camera.type='ORTHO';camera.clip_start=.1;camera.clip_end=20000
meshes=[o for o in scene.objects if o.type=='MESH']
rig=bpy.data.objects['titan_rig']
worlds={o.name:o.matrix_world.copy() for o in meshes}

def render(name,target,eye,scale,size,predicate,up='Y',transform=None):
    for o in meshes:
        o.hide_render=not predicate(o)
        if transform and not o.hide_render:
            o.matrix_world=transform@worlds[o.name]
        else:o.matrix_world=worlds[o.name]
    bpy.context.view_layer.update()
    target,eye=Vector(target),Vector(eye)
    cam.location=eye;cam.rotation_euler=(target-eye).to_track_quat('-Z',up).to_euler()
    if name=='sword-flat':
        cam.rotation_euler=Matrix(((0,-1,0),(1,0,0),(0,0,1))).to_euler()
    camera.ortho_scale=scale
    scene.render.resolution_x,scene.render.resolution_y=size
    scene.render.filepath=str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)

body=lambda o:o.get('titan_part') not in (None,'sword')
head=lambda o:o.get('titan_part') in ('head','neck') or '/collar-' in o.name
halo=lambda o:o.get('titan_part')=='halo'
arm=lambda o:o.get('titan_part') in ('shoulder.R','upper_arm.R','forearm.R','hand.R') or (o.get('titan_part','').endswith('.R') and any(f in o.get('titan_part','') for f in ['thumb.','index.','middle.','ring.','pinky.']))
sword=lambda o:o.get('titan_part')=='sword'
selected=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
def want(name):return not selected or name in selected
body_views=[('front',(0,-4000,736.8)),('three-quarter',(2828,-2828,736.8)),('side',(4000,0,736.8)),('back',(0,4000,736.8))]
for name,eye in body_views:
    if want(name):render(name,(0,0,736.8),eye,1856.346,(512,1024),body)
# Keep all body cameras level. Crown1300->y201, sole0->y918: target736.14.
# Closeups are whole-object comparisons, not claims of matching G2's larger horns.
for name,eye in [('head-front',(0,-2000,1247)),('head-side',(2000,0,1247)),('head-above',(0,0,3247))]:
    if want(name):render(name,(0,0,1247),eye,480,(768,512),head)
if want('halo'):render('halo',(0,142,1280),(0,-2000,1280),525,(768,512),halo)
if want('right-arm'):
    # Reorient the isolated arm as a rigid review assembly, shoulder left, palm up.
    pivot=Vector((-235,0,1085))
    transform=Matrix.Rotation(-math.pi/2,4,'X')@Matrix.Rotation(-math.pi/2,4,'Y')@Matrix.Translation(-pivot)
    render('right-arm',(300,-35,0),(300,-35,3000),880,(1520,448),arm,transform=transform)
if want('sword-flat'):
    # Camera local right is world+Y, making pommel left and point right.
    render('sword-flat',(0,300,0),(0,300,2000),630,(1520,284),sword,up='X')
if want('sword-edge'):
    render('sword-edge',(0,300,0),(2000,300,0),630,(1520,90),sword)
for o in meshes:o.matrix_world=worlds[o.name];o.hide_render=False
print('TITAN_RENDERS',str(OUT))
