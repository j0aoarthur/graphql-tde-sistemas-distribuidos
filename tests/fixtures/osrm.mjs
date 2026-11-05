// Deterministic protocol fixture, NOT evidence of real OSRM street coverage.
import http from 'node:http';
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');res.setHeader('content-type','application/json');
 if(url.pathname.startsWith('/table/')){const n=Number(url.searchParams.get('destinations'));res.end(JSON.stringify({code:'Ok',durations:Array.from({length:n},(_,i)=>[90+i]),distances:Array.from({length:n},(_,i)=>[1000+i])}));return;}
 if(url.pathname.startsWith('/route/')){const coords=url.pathname.split('/').at(-1).split(';').map(p=>p.split(',').map(Number));res.end(JSON.stringify({code:'Ok',routes:[{distance:1000,duration:90,geometry:{type:'LineString',coordinates:[coords[0],[coords[1][0],coords[0][1]],coords[1]]}}]}));return;}
 res.statusCode=404;res.end('{}');
}).listen(5010,'127.0.0.1');
