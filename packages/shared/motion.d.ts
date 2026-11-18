type Point=[number,number];
export function profile(id:string,dispatch?:boolean):{cruise:number;acceleration:number;braking:number;phase:number};
export function routeLength(points:Point[]):number;
export function advanceMotion(input:{points:Point[];progress?:number;speed?:number;elapsed:number;id:string;dispatch?:boolean;stopAtEnd?:boolean}):{progress:number;point:Point;speed:number;heading:number;etaSeconds:number};
export function patrolRouteAllowed(points:Point[],start?:Point):boolean;
export const PATROL_RADIUS_METERS:number;
