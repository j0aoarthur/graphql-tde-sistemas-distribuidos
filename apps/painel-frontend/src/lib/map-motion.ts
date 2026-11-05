import {alongRoute,meters} from '@sdv/shared/route';
import type {LatLon} from '../types';
export type MotionSample={time:number;point:LatLon;route:LatLon[]|null;raw:string|null;progress:number;heading:number};
export const TELEMETRY_BUFFER_MS=1800;
export function remainingRoute(points:LatLon[],progress:number):LatLon[]{
 if(progress>=1)return [];let offset=0;const lengths=points.slice(1).map((p,i)=>meters(points[i],p)),distance=lengths.reduce((a,b)=>a+b,0)*Math.max(0,progress);
 for(let i=0;i<lengths.length;i++){offset+=lengths[i];if(offset>=distance)return [alongRoute(points,progress),...points.slice(i+1)];}return [];
}
/** Render only between confirmed samples, never beyond the latest GPS. */
export function interpolateSamples(samples:MotionSample[],time:number):{point:LatLon;progress:number;heading:number;raw:string|null}{
 const first=samples[0],last=samples.at(-1)!;
 if(time<=first.time)return first;if(time>=last.time)return last;
 const index=samples.findIndex(p=>p.time>=time),a=samples[index-1],b=samples[index],t=(time-a.time)/(b.time-a.time);
 const progress=a.progress+(b.progress-a.progress)*t;
 let point:LatLon=b.point;
 if(a.route&&a.raw===b.raw&&b.progress>=a.progress)point=alongRoute(a.route,progress);
 // Route changes are only joined when both geometries share the confirmed boundary.
 else if(a.route&&b.route&&meters(a.route.at(-1)!,b.route[0])<2){
  const tail=remainingRoute(a.route,a.progress),head:LatLon[]=[b.route[0]];
  const total=b.route.slice(1).reduce((s,p,i)=>s+meters(b.route![i],p),0);let offset=0;
  for(let i=1;i<b.route.length;i++){offset+=meters(b.route[i-1],b.route[i]);if(offset>=total*b.progress)break;head.push(b.route[i]);}head.push(b.point);point=alongRoute([...tail,...head],t);
 }
 // No geometry / reroute discontinuity: keep the last confirmed position until the next sample.
 else point=a.point;
 const angle=((b.heading-a.heading+540)%360)-180;
 return {point,progress:a.raw===b.raw?progress:b.progress,heading:a.heading+angle*t,raw:b.raw};
}
