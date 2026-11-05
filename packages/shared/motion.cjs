const {meters,alongRoute}=require('./route.cjs');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function profile(id,dispatch=false){let hash=2166136261;for(const c of String(id)){hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;}return {cruise:(dispatch?9:7)+(hash%1000)/1000*(dispatch?5:4),acceleration:1.1+(hash%7)/10,braking:2.2,phase:hash%19};}
function routeLength(points){return points.slice(1).reduce((s,p,i)=>s+meters(points[i],p),0);}
function heading(a,b){return Math.atan2((b[1]-a[1])*Math.cos(a[0]*Math.PI/180),b[0]-a[0])*180/Math.PI;}
function targetSpeed(points,distance,total,p,stopAtEnd){
 let offset=0,limit=p.cruise*(.88+.12*Math.sin(distance/110+p.phase));
 for(let i=1;i<points.length-1;i++){
  offset+=meters(points[i-1],points[i]);const ahead=offset-distance;if(ahead<0||ahead>65)continue;
  const turn=Math.abs(((heading(points[i],points[i+1])-heading(points[i-1],points[i])+540)%360)-180);
  if(turn>20){const corner=clamp(11-turn/12,3.2,p.cruise);limit=Math.min(limit,Math.sqrt(corner*corner+2*p.braking*ahead));}
 }
 if(stopAtEnd)limit=Math.min(limit,Math.sqrt(2*p.braking*Math.max(0,total-distance)));
 return limit;
}
/** Deterministic fictitious urban driving, in physical seconds/metres. No live traffic claim. */
function advanceMotion({points,progress=0,speed=0,elapsed,id,dispatch=false,stopAtEnd=true}){
 const total=routeLength(points),p=profile(id,dispatch);let distance=clamp(progress,0,1)*total,v=clamp(Number(speed)||0,0,14);
 let remaining=clamp(Number(elapsed)||0,0,120);
 while(remaining>1e-8&&distance<total){const dt=Math.min(.1,remaining),target=targetSpeed(points,distance,total,p,stopAtEnd),next=v+clamp(target-v,-p.braking*dt,p.acceleration*dt);distance=Math.min(total,distance+(v+next)*.5*dt);v=next;remaining-=dt;}
 const fraction=total?clamp(distance/total,0,1):1,point=alongRoute(points,fraction),before=alongRoute(points,Math.max(0,fraction-.0001)),after=alongRoute(points,Math.min(1,fraction+.0001));
 return {progress:fraction,point,speed:fraction===1?0:v,heading:(heading(before,after)+360)%360,etaSeconds:fraction===1?0:Math.max(1,(total-distance)/(p.cruise*.88)+Math.max(0,(p.cruise-v)/p.acceleration)/2)};
}
const PATROL_CENTER=[-12.260,-38.966],PATROL_RADIUS_METERS=6000;
function patrolRouteAllowed(points,start=points[0]){const radius=Math.max(PATROL_RADIUS_METERS,meters(PATROL_CENTER,start)+150);return points.length>1&&points.every(p=>p.every(Number.isFinite)&&meters(PATROL_CENTER,p)<=radius);}
module.exports={profile,routeLength,advanceMotion,patrolRouteAllowed,PATROL_RADIUS_METERS};
