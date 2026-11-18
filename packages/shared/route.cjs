const earth=6371000;
function meters(a,b){const rad=Math.PI/180,dLat=(b[0]-a[0])*rad,dLon=(b[1]-a[1])*rad,h=Math.sin(dLat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dLon/2)**2;return 2*earth*Math.asin(Math.min(1,Math.sqrt(h)));}
function alongRoute(points,fraction){if(!points.length)throw Error('Rota vazia');if(points.length===1)return points[0];const total=points.slice(1).reduce((s,p,i)=>s+meters(points[i],p),0);let left=Math.max(0,Math.min(1,fraction))*total;for(let i=1;i<points.length;i++){const d=meters(points[i-1],points[i]);if(left<=d||i===points.length-1){const k=d?Math.min(1,left/d):0;return [points[i-1][0]+(points[i][0]-points[i-1][0])*k,points[i-1][1]+(points[i][1]-points[i-1][1])*k];}left-=d;}return points.at(-1);}
module.exports={meters,alongRoute};
