"""Draw the sparse, purpose-made UV atlas. Run with Python + Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).resolve().parents[3]
out=root/'src/client/render/mech/assets/sunhawk-details.png'
S=2
im=Image.new('RGBA',(1024*S,1024*S),(0,0,0,0))
d=ImageDraw.Draw(im)
ink=(40,54,79,160); blue=(32,91,164,175); gold=(222,155,40,205)
def line(tile,points,color=ink,width=2):
    ox=(tile%2)*512; oy=(tile//2)*512
    d.line([((x+ox)*S,(y+oy)*S) for x,y in points],fill=color,width=width*S,joint='curve')
def label(tile,xy,text):
    ox=(tile%2)*512; oy=(tile//2)*512
    font=ImageFont.load_default(size=13*S)
    d.text(((xy[0]+ox)*S,(xy[1]+oy)*S),text,font=font,fill=ink)
# Chest: collar break and lower access seams, keeping the core and gills clear.
for side in (0,1):
    flip=lambda pts:[(512-x,y) if side else (x,y) for x,y in pts]
    line(0,flip([(78,104),(164,104),(187,82)]))
    line(0,flip([(84,369),(136,405),(196,418)]))
    line(0,flip([(108,366),(142,388)]),blue,3)
label(0,(212,71),'SOL / S1')
# Forearms: end caps, latch and short inspection stencil.
line(1,[(90,84),(180,84),(198,106),(314,106),(332,84),(422,84)])
line(1,[(112,392),(148,424),(364,424),(400,392)])
line(1,[(143,375),(179,375)],blue,3)
label(1,(204,374),'ACCESS 03')
for x in (190,214,238): line(1,[(x,150),(x+14,150)],gold,3)
# Shins: a few seam breaks, leaving the broad shadow plane intact.
line(2,[(105,105),(153,88),(189,88)])
line(2,[(323,88),(359,88),(407,105)])
line(2,[(131,341),(161,380),(351,380),(381,341)])
line(2,[(173,405),(221,405)],blue,3)
label(2,(279,401),'SK-01')
# Thighs: access cap, paired screws and a tiny registration mark.
line(3,[(98,107),(133,87),(379,87),(414,107)])
line(3,[(125,389),(157,410),(355,410),(387,389)])
for x in (162,350): line(3,[(x-5,117),(x+5,117)],ink,3)
label(3,(213,363),'SOLSTICE')
im.resize((1024,1024),Image.Resampling.LANCZOS).save(out,optimize=True)
print(out)
