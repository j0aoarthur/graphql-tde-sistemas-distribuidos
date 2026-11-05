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
  express.use('/auth',async(req:any,res:any)=>{
    try{
      const url=new URL(`/auth${req.url}`,process.env.OCCORRENCIAS_URL??'http://localhost:4001/graphql');
      if(req.method!=='POST'||!['/auth/login','/auth/refresh','/auth/logout'].includes(url.pathname))return res.sendStatus(404);
      const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','cookie':req.headers.cookie??'','origin':req.headers.origin??'','x-sdv-csrf':req.headers['x-sdv-csrf']??''},body:JSON.stringify(req.body??{}),signal:AbortSignal.timeout(10000)});
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
