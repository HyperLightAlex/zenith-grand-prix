/** Geometry-based neck seating for immutable loaded assets; no stock-model edits.
 * Caller retains the legacy HEAD_SEATS policy for legacy-only pairs.
 */
import type { BufferGeometry } from 'three';
import type { RosterFittings } from './rosterAsset';
export interface HeadSeatAsset {
  dims: { headY: number; headZ: number };
  fittings?: RosterFittings;
  parts: readonly { joint: string; part?: string; geometry: BufferGeometry }[];
}
const CELL=.02, NECK=.3, CAP=.6, ORIGIN=-2;
const xs=Array.from({length:200},(_,i)=>ORIGIN+(i+.5)*CELL).filter(x=>Math.abs(x)<=NECK);
interface Surface {
  asset: HeadSeatAsset;
  headY:number; headZ:number;
  top:Float32Array;
  bottoms:Map<string,Float32Array>;
  own?:number;
}
const surfaces=new WeakMap<HeadSeatAsset['parts'],Surface>();
const pairs=new WeakMap<Surface,WeakMap<Surface,{insertion:number|undefined;clearance:number;capacity:number|undefined;value:number|undefined}>>();
function zs(headZ:number):number[] {
  // Same world-grid sample locations and boundary rule as tools/head-seats.ts,
  // restricted to its tiny neck footprint instead of a whole-body grid.
  const out:number[]=[];
  const low=Math.max(0,Math.floor((headZ-NECK-ORIGIN)/CELL)-1);
  const high=Math.min(249,Math.ceil((headZ+NECK-ORIGIN)/CELL)+1);
  for(let i=low;i<=high;i++){const z=ORIGIN+(i+.5)*CELL;if(Math.abs(z-headZ)<=NECK)out.push(z);}
  return out;
}
function raster(asset:HeadSeatAsset, chest:boolean, headZ:number, headY=0):Float32Array {
  const rows=zs(headZ), localZ=rows;
  const dy=chest?0:headY,dz=chest?0:headZ;
  const out=new Float32Array(xs.length*rows.length).fill(NaN);
  const cap=chest?asset.dims.headY+CAP:Infinity;
  for(const part of asset.parts){
    // The narrow neck footprint deliberately excludes back rings, shoulder
    // ornaments and Maul's chest-joint head cowl from the support measurement.
    if(part.joint!==(chest?'chest':'head')||part.part!==(chest?'chest':'head'))continue;
    const p=part.geometry.getAttribute('position'),ix=part.geometry.index;
    const count=ix?ix.count:p.count;
    for(let t=0;t<count;t+=3){
      const ia=ix?ix.getX(t):t,ib=ix?ix.getX(t+1):t+1,ic=ix?ix.getX(t+2):t+2;
      const ax=p.getX(ia),ay=p.getY(ia)+dy,az=p.getZ(ia)+dz,bx=p.getX(ib),by=p.getY(ib)+dy,bz=p.getZ(ib)+dz,cx=p.getX(ic),cy=p.getY(ic)+dy,cz=p.getZ(ic)+dz;
      const minX=Math.min(ax,bx,cx),maxX=Math.max(ax,bx,cx),minZ=Math.min(az,bz,cz),maxZ=Math.max(az,bz,cz);
      if(maxX<xs[0]||minX>xs[xs.length-1]||maxZ<localZ[0]||minZ>localZ[localZ.length-1])continue;
      const area=(bx-ax)*(cz-az)-(cx-ax)*(bz-az);if(Math.abs(area)<1e-12)continue;
      const i0=Math.max(0,Math.floor((minX-xs[0])/CELL)),i1=Math.min(xs.length-1,Math.ceil((maxX-xs[0])/CELL));
      const j0=Math.max(0,Math.floor((minZ-localZ[0])/CELL)),j1=Math.min(localZ.length-1,Math.ceil((maxZ-localZ[0])/CELL));
      for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
        const x=xs[i],z=localZ[j];
        const w0=((bx-x)*(cz-z)-(cx-x)*(bz-z))/area,w1=((cx-x)*(az-z)-(ax-x)*(cz-z))/area,w2=1-w0-w1;
        if(w0<0||w1<0||w2<0)continue;
        const y=w0*ay+w1*by+w2*cy;if(chest&&y>cap)continue;
        const index=j*xs.length+i,old=out[index];
        if(Number.isNaN(old)||(chest?y>old:y<old))out[index]=y;
      }
    }
  }
  return out;
}
function bottom(s:Surface, headZ:number, headY:number):Float32Array {
  const key=`${headZ}/${headY}`;
  let m=s.bottoms.get(key);if(!m){m=raster(s.asset,false,headZ,headY);s.bottoms.set(key,m);}return m;
}
function sunk(chest:Surface,head:Surface):number|undefined {
  const floor=bottom(head,chest.headZ,chest.headY);let most=-Infinity;
  for(let i=0;i<chest.top.length;i++)if(Number.isFinite(chest.top[i])&&Number.isFinite(floor[i]))most=Math.max(most,chest.top[i]-floor[i]);
  return Number.isFinite(most)?most:undefined;
}
function surface(asset:HeadSeatAsset):Surface {
  let s=surfaces.get(asset.parts);
  // Assets' geometry is immutable. Preview registration installs new parts
  // arrays, invalidating caches without retaining old decoded assets.
  if(!s||s.headY!==asset.dims.headY||s.headZ!==asset.dims.headZ){
    s={asset,headY:asset.dims.headY,headZ:asset.dims.headZ,top:raster(asset,true,asset.dims.headZ),bottoms:new Map()};
    s.own=sunk(s,s);surfaces.set(asset.parts,s);
  }
  return s;
}
/** Metres to raise a donor head on the receiver chest. Undefined means there
 * is no valid narrow neck support overlap; caller should report/fall back,
 * never fit from decorative outer bounds. Same loaded design is exactly zero.
 */
export function nativeHeadSeat(chest:HeadSeatAsset,head:HeadSeatAsset):number|undefined {
  if(chest.parts===head.parts)return 0;
  const c=surface(chest),h=surface(head);let m=pairs.get(c);if(!m){m=new WeakMap();pairs.set(c,m);}
  // A thin hidden stem is not the helmet's visible underside. Reviewed module
  // interfaces override its safe insertion or the receiver collar clearance;
  // the actual receiving surface is still measured, never keyed by design pair.
  const insertion=head.fittings?.mounts?.headInsertion??h.own;
  const clearance=chest.fittings?.mounts?.headClearance??0;
  // A receiver with a shallow bespoke stock neck can still accept deeper
  // foreign stems. Capacity belongs to the torso, not to a hard-coded pair.
  const capacity=chest.fittings?.mounts?.headCapacity??c.own;
  const cached=m.get(h);if(cached&&cached.insertion===insertion&&cached.clearance===clearance&&cached.capacity===capacity)return cached.value;
  const now=sunk(c,h),value=now===undefined||capacity===undefined||insertion===undefined?undefined:Math.round((now-Math.min(capacity-clearance,insertion))*50)/50;
  m.set(h,{insertion,clearance,capacity,value});return value;
}

// Backpack fitting uses only a narrow central saddle patch. Never use a
// module's bounds: wings, halo drums and burner tips are not mating surfaces.
const PACK_X=[-.25,0,.25];
const PACK_Y=Array.from({length:12},(_,i)=>(i+1)*.1);
const STOCK_EMBED=.35, STOCK_GAP=.12;
const PACK_POINTS=PACK_Y.flatMap(y=>PACK_X.map(x=>[x,y] as const));
interface PackSurface {
  back:Float64Array;
  front:Float64Array;
  stockPatch:readonly number[];
}
export interface SeatRange { min:number; median:number; max:number }
export interface BackpackSeat {
  /** Chest-local rigid displacement. +Z is forward, toward the chest. */
  deltaZ:number;
  samples:number;
  donorSamples:number;
  /** Donor contact samples excluded because the receiver has no saddle there. */
  missingReceiverSamples:number;
  /** Positive is an air gap; negative is an intentional embed/overlap. */
  stockGap:SeatRange;
  beforeGap:SeatRange;
  afterGap:SeatRange;
  /** Difference from the donor's stock gap at the same sampled points. */
  afterMinusStock:SeatRange;
}
const packSurfaces=new WeakMap<HeadSeatAsset['parts'],PackSurface>();
const packPairs=new WeakMap<PackSurface,WeakMap<PackSurface,BackpackSeat|undefined>>();
function median(a:readonly number[]):number {
  const sorted=[...a].sort((a,b)=>a-b),n=sorted.length;
  return n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;
}
function range(a:readonly number[]):SeatRange{return {min:Math.min(...a),median:median(a),max:Math.max(...a)};}
function packSurface(asset:HeadSeatAsset):PackSurface {
  let cached=packSurfaces.get(asset.parts);if(cached)return cached;
  const back=new Float64Array(PACK_POINTS.length).fill(NaN),front=new Float64Array(PACK_POINTS.length).fill(NaN);
  for(const part of asset.parts){
    if(part.joint!=='chest'||(part.part!=='chest'&&part.part!=='backpack'))continue;
    const chest=part.part==='chest',out=chest?back:front;
    const p=part.geometry.getAttribute('position'),ix=part.geometry.index,count=ix?ix.count:p.count;
    for(let t=0;t<count;t+=3){
      const ia=ix?ix.getX(t):t,ib=ix?ix.getX(t+1):t+1,ic=ix?ix.getX(t+2):t+2;
      const ax=p.getX(ia),ay=p.getY(ia),az=p.getZ(ia),bx=p.getX(ib),by=p.getY(ib),bz=p.getZ(ib),cx=p.getX(ic),cy=p.getY(ic),cz=p.getZ(ic);
      const minX=Math.min(ax,bx,cx),maxX=Math.max(ax,bx,cx),minY=Math.min(ay,by,cy),maxY=Math.max(ay,by,cy);
      if(maxX<PACK_X[0]||minX>PACK_X[2]||maxY<PACK_Y[0]||minY>PACK_Y[11])continue;
      const area=(bx-ax)*(cy-ay)-(cx-ax)*(by-ay);if(Math.abs(area)<1e-12)continue;
      for(let i=0;i<PACK_POINTS.length;i++){
        const [x,y]=PACK_POINTS[i];if(x<minX||x>maxX||y<minY||y>maxY)continue;
        const w0=((bx-x)*(cy-y)-(cx-x)*(by-y))/area,w1=((cx-x)*(ay-y)-(ax-x)*(cy-y))/area,w2=1-w0-w1;
        if(w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9)continue;
        const z=w0*az+w1*bz+w2*cz,old=out[i];
        if(Number.isNaN(old)||(chest?z<old:z>old))out[i]=z;
      }
    }
  }
  const stockPatch=PACK_POINTS.map((_,i)=>i).filter(i=>Number.isFinite(back[i])&&Number.isFinite(front[i])&&front[i]-back[i]<=STOCK_EMBED&&back[i]-front[i]<=STOCK_GAP);
  cached={back,front,stockPatch};packSurfaces.set(asset.parts,cached);return cached;
}
/** Fits a whole donor backpack to the receiver torso while retaining the
 * donor's stock mounting depth. Uses LOD0 assets for every visual LOD. Positive stock gap is limited to
 * .12m and embed to .35m; receiver and donor contact footprints must overlap.
 * Returns undefined when fewer than 3 points form a valid stock contact patch.
 * Cached by immutable parts arrays, so asset replacement invalidates it.
 * No collision solver: diagnostics expose residual contour mismatch; the
 * algorithm cannot make incompatible curved saddles share every surface.
 */
export function nativeBackpackSeat(receiver:HeadSeatAsset,donor:HeadSeatAsset):BackpackSeat|undefined {
  const r=packSurface(receiver),d=packSurface(donor);
  let cache=packPairs.get(r);if(!cache){cache=new WeakMap();packPairs.set(r,cache);}
  if(cache.has(d))return cache.get(d);
  // Both stock assemblies identify where their central saddle really meets
  // the torso; their intersection excludes upper neck cutbacks and free rims.
  const receiverPatch=new Set(r.stockPatch);
  const indices=d.stockPatch.filter(i=>receiverPatch.has(i));
  if(indices.length<3){cache.set(d,undefined);return undefined;}
  const shifts=indices.map(i=>r.back[i]-d.back[i]);
  const deltaZ=receiver.parts===donor.parts?0:median(shifts);
  const stock=indices.map(i=>d.back[i]-d.front[i]),before=indices.map(i=>r.back[i]-d.front[i]);
  const after=before.map(v=>v-deltaZ),residual=after.map((v,i)=>v-stock[i]);
  const result={deltaZ,samples:indices.length,donorSamples:d.stockPatch.length,missingReceiverSamples:d.stockPatch.length-indices.length,stockGap:range(stock),beforeGap:range(before),afterGap:range(after),afterMinusStock:range(residual)};
  cache.set(d,result);return result;
}
