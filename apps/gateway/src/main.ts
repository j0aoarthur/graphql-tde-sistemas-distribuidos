import 'reflect-metadata';
import { Module,Controller,Get } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloGatewayDriver, ApolloGatewayDriverConfig } from '@nestjs/apollo';
import { IntrospectAndCompose, RemoteGraphQLDataSource } from '@apollo/gateway';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import Redis from 'ioredis';
import * as jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
@Controller('health') class HealthController{@Get() ok(){return {status:'ok',service:'gateway'};}}
@Module({imports:[GraphQLModule.forRoot<ApolloGatewayDriverConfig>({
  driver:ApolloGatewayDriver,
  server:{introspection:process.env.NODE_ENV!=='production',context:({req}:any)=>({authorization:req.headers.authorization??''})},
  gateway:{
    supergraphSdl:new IntrospectAndCompose({subgraphs:[
      {name:'ocorrencias',url:process.env.OCCORRENCIAS_URL??'http://localhost:4001/graphql'},
      {name:'viaturas',url:process.env.VIATURAS_URL??'http://localhost:4002/graphql'},
    ]}),
    buildService:({url})=>new RemoteGraphQLDataSource({url,willSendRequest({request,context}){
      request.http?.headers.set('authorization',String(context.authorization??''));
    }}),
  },
})],controllers:[HealthController]})
class AppModule {}
/** Redis Pub/Sub is transient; clients always re-fetch GraphQL state after reconnect. */
function events():AsyncIterable<{eventoSDV:{tipo:string;entidadeId:string;timestamp:string}}>{
  return {async *[Symbol.asyncIterator](){
    const subscriber=new Redis(process.env.REDIS_URL??'redis://localhost:6379');
    const queue:Array<{tipo:string;entidadeId:string;timestamp:string}>=[];
    let wake:(()=>void)|null=null;
    subscriber.on('message',(_channel,msg)=>{try{queue.push(JSON.parse(msg));wake?.();wake=null;}catch{}});
    try{await subscriber.subscribe('sdv:updates');while(true){if(!queue.length)await new Promise<void>(resolve=>wake=resolve);while(queue.length)yield {eventoSDV:queue.shift()!};}}
    finally{subscriber.disconnect();}
  }};
}
const schema=makeExecutableSchema({
  typeDefs:`type Query { ping: String! } type SDVEvento {tipo:String! entidadeId:ID! timestamp:String!} type Subscription {eventoSDV: SDVEvento!}`,
  resolvers:{Query:{ping:()=>'pong'},Subscription:{eventoSDV:{subscribe:()=>events()}}},
});
async function bootstrap(){
  const app=await NestFactory.create(AppModule);
  const express=app.getHttpAdapter().getInstance();
  express.use(require('express').json({limit:'16kb'}));
  // Documentação da API HTTP (Swagger UI). Só com SWAGGER_ENABLED=1 e nunca em produção. Documenta também as rotas internas (token compartilhado).
  const swaggerOn=process.env.SWAGGER_ENABLED==='1'&&process.env.NODE_ENV!=='production';
  if(swaggerOn){
    const openapi=JSON.parse(readFileSync(join(__dirname,'openapi.json'),'utf8'));
    express.get('/openapi.json',(_req:any,res:any)=>res.json(openapi));
    express.use('/docs/assets',require('express').static(require('swagger-ui-dist').getAbsoluteFSPath()));
    express.get('/docs/init.js',(_req:any,res:any)=>res.type('js').send("window.ui=SwaggerUIBundle({url:'/openapi.json',dom_id:'#swagger-ui',deepLinking:true});"));
    express.get('/docs',(_req:any,res:any)=>res.type('html').send('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SDV · API</title><link rel="stylesheet" href="/docs/assets/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/docs/assets/swagger-ui-bundle.js"></script><script src="/docs/init.js"></script></body></html>'));
  }
  express.use('/auth',async(req:any,res:any)=>{
    try{
      const url=new URL(`/auth${req.url}`,process.env.OCCORRENCIAS_URL??'http://localhost:4001/graphql');
      if(req.method!=='POST'||!['/auth/login','/auth/refresh','/auth/logout'].includes(url.pathname))return res.sendStatus(404);
      // Swagger UI (dev, SWAGGER_ENABLED=1) chama da própria origem do gateway: trata como a origem do painel para passar na checagem de Origin do serviço.
      const ownOrigin=`${req.protocol}://${req.headers.host}`,forwardedOrigin=swaggerOn&&req.headers.origin===ownOrigin?(process.env.FRONTEND_ORIGIN??'http://localhost:5173').split(',')[0]:(req.headers.origin??'');
      const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','cookie':req.headers.cookie??'','origin':forwardedOrigin,'x-sdv-csrf':req.headers['x-sdv-csrf']??''},body:JSON.stringify(req.body??{}),signal:AbortSignal.timeout(10000)});
      res.setHeader('Cache-Control','no-store');
      const cookie=response.headers.get('set-cookie');if(cookie)res.setHeader('Set-Cookie',cookie);
      res.status(response.status).type('json').send(await response.text());
    }catch{res.status(502).json({error:'Serviço de sessão indisponível'});}
  });
  app.enableCors({origin:(process.env.FRONTEND_ORIGIN??'http://localhost:5173').split(',')});
  const wss=new WebSocketServer({server:app.getHttpServer(),path:'/subscriptions'});
  const expiryTimers=new WeakMap<object,ReturnType<typeof setTimeout>>();
  const serverCleanup=useServer({schema,onClose:(ctx)=>{const timer=expiryTimers.get(ctx.extra.socket);if(timer)clearTimeout(timer);},onConnect:(ctx)=>{
    const auth=String(ctx.connectionParams?.authorization??'').replace(/^Bearer\s+/i,'');
    const claim=jwt.verify(auth,process.env.JWT_SECRET!,{algorithms:['HS256']}) as jwt.JwtPayload;
    if(claim.papel!=='ADMIN'||!claim.exp)throw Error('Forbidden');
    const timer=setTimeout(()=>ctx.extra.socket.close(4403,'Credencial expirada'),Math.max(0,claim.exp*1000-Date.now()));
    expiryTimers.set(ctx.extra.socket,timer);
  }},wss);
  app.enableShutdownHooks();
  process.once('SIGTERM',()=>{void serverCleanup.dispose();wss.close();});
  await app.listen(Number(process.env.PORT||4000),'0.0.0.0');
}
bootstrap().catch(e=>{console.error(e);process.exitCode=1;});
