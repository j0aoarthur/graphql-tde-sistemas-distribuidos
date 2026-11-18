// Local TLS fixture only. Certificate/key are generated under /tmp, never committed.
import https from 'node:https';import http from 'node:http';import net from 'node:net';import {readFileSync} from 'node:fs';
const server=https.createServer({key:readFileSync('/tmp/sdv-tls/key.pem'),cert:readFileSync('/tmp/sdv-tls/cert.pem')},(req,res)=>{
 const port=req.url.startsWith('/auth/')?4011:req.url.startsWith('/graphql')?4000:5173;
 const upstream=http.request({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:{...req.headers,host:`localhost:${port}`}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
});
server.on('upgrade',(req,socket,head)=>{const port=req.url.startsWith('/subscriptions')?4000:5173;const upstream=net.connect(port,'127.0.0.1',()=>{upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(req.headers).map(([key,value])=>`${key}: ${value}`).join('\r\n')}\r\n\r\n`);if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);});upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());});
server.listen(5443,'127.0.0.1');
