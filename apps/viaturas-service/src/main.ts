import 'reflect-metadata';
import { forecast,dayRange } from './estimates';
import { Module, Injectable, OnModuleInit, OnModuleDestroy, Controller, Post, Body, Headers, UnauthorizedException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GraphQLModule, Resolver, Query, Mutation, Args, Context, ResolveReference, ResolveField, Parent } from '@nestjs/graphql';
import { ApolloFederationDriver, ApolloFederationDriverConfig } from '@nestjs/apollo';
import { PrismaClient, Prisma } from './generated/client';
import Redis from 'ioredis';
import * as jwt from 'jsonwebtoken';
import { rankViaturas } from '@sdv/shared';
import { isValidPlate, normalizePlate } from '@sdv/shared/plate';
import { TRACE_CHANNEL, makeTrace, traceEnabled, type TraceInput } from '@sdv/shared/trace';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

@Injectable()
class Database extends PrismaClient implements OnModuleInit,OnModuleDestroy {
  async onModuleInit(){await this.$connect();}
  async onModuleDestroy(){await this.$disconnect();}
}
function requireAdmin(ctx:any){
  const token=String(ctx.req?.headers?.authorization??'').replace(/^Bearer\s+/i,'');
  try {const claims=jwt.verify(token,process.env.JWT_SECRET!,{algorithms:['HS256']}) as jwt.JwtPayload;if(claims.papel!=='ADMIN') throw Error('invalid');}
  catch {throw new UnauthorizedException('Token inválido');}
}
const ARENA_LOCK_OFF='sdv:arena:lock-off';
const validLatLon=(a:number,b:number)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a)<=90&&Math.abs(b)<=180;
@Injectable()
class DispatchService implements OnModuleDestroy {
  private redis=new Redis(process.env.REDIS_URL??'redis://localhost:6379',{maxRetriesPerRequest:1});
  constructor(private readonly db: Database) {}
  async onModuleDestroy(){this.redis.disconnect();}
  async getSimulation(){
    const [factor,paused,signal]=await Promise.all([this.redis.get('sdv:sim:factor'),this.redis.get('sdv:sim:paused'),this.redis.get('sdv:sim:signal-lost')]);
    return {fator:factor?Number(factor):1,pausada:paused==='1',sinalIndisponivel:signal==='1'};
  }
  async setSimulation(fator:number,pausada:boolean){
    await this.db.despacho.updateMany({where:{status:{in:['CONFIRMADO','EM_DESLOCAMENTO']}},data:{previsaoChegadaEm:null,versao:{increment:1}}});
    await this.redis.mset('sdv:sim:factor',String(fator),'sdv:sim:paused',pausada?'1':'0');
    await this.emit('SIMULACAO','global');return this.getSimulation();
  }
  async signalLoss(segundos:number){
    await this.redis.set('sdv:sim:signal-lost','1','EX',segundos);
    await this.emit('SIMULACAO','global');return this.getSimulation();
  }
  async emit(tipo:string,entidadeId:string){await this.redis.publish('sdv:updates',JSON.stringify({tipo,entidadeId,timestamp:new Date().toISOString()})).catch(()=>undefined);}
  /** Rastro da decisão para a Arena de concorrência. Desligado por padrão; nunca altera nem atrasa o fluxo. */
  private readonly tracing=traceEnabled();
  private trace(p:TraceInput,t0:number){
    if(!this.tracing)return;
    try{void this.redis.publish(TRACE_CHANNEL,JSON.stringify(makeTrace({...p,ms:Date.now()-t0}))).catch(()=>undefined);}catch{/* rastro é best-effort */}
  }
  async alocar(input: {ocorrenciaId:string;latitude:number;longitude:number;worker?:string}) {
    const t0=Date.now(),worker=typeof input.worker==='string'?input.worker:undefined;
    if (!/^[0-9a-f-]{36}$/i.test(input.ocorrenciaId)||!validLatLon(input.latitude,input.longitude)) throw new BadRequestException('Dados inválidos');
    const anterior=await this.db.despacho.findUnique({where:{ocorrenciaId:input.ocorrenciaId}});
    if(anterior){this.trace({ocorrenciaId:input.ocorrenciaId,passo:'JA_DESPACHADA',worker},t0);return {status:anterior.status==='CANCELADO'?'CANCELADO':'DESPACHADA',viaturaId:anterior.viaturaId,despachoId:anterior.id};}
    const livres=await this.db.viatura.findMany({where:{status:'DISPONIVEL',ultimoSinalEm:{gte:new Date(Date.now()-30000)},turnos:{some:{fimEm:null}}}});
    const lockOff=process.env.SDV_DEMO_MODE==='1'&&await this.redis.get(ARENA_LOCK_OFF).catch(()=>null)==='1';
    const candidatas=rankViaturas(livres,{latitude:input.latitude,longitude:input.longitude});
    this.trace({ocorrenciaId:input.ocorrenciaId,passo:'ALOCACAO_INICIADA',worker,detalhe:`${candidatas.length} livres`},t0);
    for(const viatura of candidatas) {
      const key=`sdv:lock:viatura:${viatura.id}`;
      const token=randomUUID();
      // Somente na demo (SDV_DEMO_MODE=1): a Arena pode desligar o lock do Redis para provar que o PostgreSQL sozinho impede a duplicidade.
      const obtained=lockOff?'OK':await this.redis.set(key,token,'PX',10000,'NX');
      if(obtained!=='OK'){this.trace({ocorrenciaId:input.ocorrenciaId,passo:'LOCK_OCUPADO',worker,viaturaCodigo:viatura.codigo},t0);continue;}
      try {
        const result=await this.db.$transaction(async tx=>{
          const existing=await tx.despacho.findUnique({where:{ocorrenciaId:input.ocorrenciaId}});
          if(existing) return {status:'DESPACHADA',viaturaId:existing.viaturaId,despachoId:existing.id};
          const updated=await tx.viatura.updateMany({where:{id:viatura.id,status:'DISPONIVEL'},data:{status:'OCUPADA',versao:{increment:1}}});
          if(updated.count!==1){this.trace({ocorrenciaId:input.ocorrenciaId,passo:'CAS_PERDEU',worker,viaturaCodigo:viatura.codigo},t0);return null;}
          await tx.patrulha.updateMany({where:{viaturaId:viatura.id,status:'ATIVA'},data:{status:'SUSPENSA'}});
          const despacho=await tx.despacho.create({data:{ocorrenciaId:input.ocorrenciaId,viaturaId:viatura.id,status:'CONFIRMADO',destinoLat:input.latitude,destinoLon:input.longitude}});
          await tx.outbox.create({data:{tipo:'DESPACHO_CONFIRMADO',payload:{despachoId:despacho.id,ocorrenciaId:input.ocorrenciaId,viaturaId:viatura.id}}});
          return {status:'DESPACHADA',viaturaId:viatura.id,despachoId:despacho.id};
        });
        if(result){if(result.viaturaId===viatura.id)this.trace({ocorrenciaId:input.ocorrenciaId,passo:'VENCEU',worker,viaturaCodigo:viatura.codigo},t0);else this.trace({ocorrenciaId:input.ocorrenciaId,passo:'JA_DESPACHADA',worker},t0);await this.emit('DESPACHO',input.ocorrenciaId);return result;}
      } catch(err) {
        if(err instanceof Prisma.PrismaClientKnownRequestError && err.code==='P2002') {
          const current=await this.db.despacho.findUnique({where:{ocorrenciaId:input.ocorrenciaId}});
          if(current){this.trace({ocorrenciaId:input.ocorrenciaId,passo:'JA_DESPACHADA',worker},t0);return {status:'DESPACHADA',viaturaId:current.viaturaId,despachoId:current.id};}
          this.trace({ocorrenciaId:input.ocorrenciaId,passo:'INDICE_RECUSOU',worker,viaturaCodigo:viatura.codigo},t0);
          continue;
        }
        throw err;
      } finally {await this.redis.eval('if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end',1,key,token).catch(()=>undefined);}
    }
    const again=await this.db.despacho.findUnique({where:{ocorrenciaId:input.ocorrenciaId}});
    if(again) return {status:'DESPACHADA',viaturaId:again.viaturaId,despachoId:again.id};
    this.trace({ocorrenciaId:input.ocorrenciaId,passo:'SEM_VIATURA',worker},t0);
    return {status:'SEM_VIATURA'};
  }
  /** ── Arena de concorrência (demonstração) ───────────────────────────────────────────────────────────────
   * Reserva viaturas para que poucas fiquem livres e a disputa fique visível. Só com SDV_DEMO_MODE=1.
   * `INDISPONIVEL` não é usado por nenhum outro fluxo: reservar/restaurar é um UPDATE condicional por status,
   * o simulador só patrulha `DISPONIVEL` (a reservada fica parada) e o despacho só considera `DISPONIVEL`. */
  assertDemo(){if(process.env.SDV_DEMO_MODE!=='1')throw new ForbiddenException('Modo de demonstração desativado (defina SDV_DEMO_MODE=1 no ambiente de demonstração).');}
  async estadoArena(){
    const [reservadas,livres,consumers,lockOff]=await Promise.all([
      this.db.viatura.count({where:{status:'INDISPONIVEL'}}),
      this.db.viatura.count({where:{status:'DISPONIVEL',turnos:{some:{fimEm:null}}}}),
      (this.redis.xinfo('CONSUMERS','sdv:ocorrencias','sdv:dispatch') as Promise<any[]>).catch(()=>[] as any[]),
      this.redis.get(ARENA_LOCK_OFF).catch(()=>null),
    ]);
    // Cada consumer é um array [nome,<n>,'pending',<n>,'idle',<ms>,...]; vivo = interagiu há menos de 10 s.
    const workers=consumers.filter(c=>{const i=c.indexOf('idle');return i>=0&&Number(c[i+1])<10000;}).length;
    return {ativa:reservadas>0,livres,reservadas,workers,rastroAtivo:this.tracing,modoDemo:process.env.SDV_DEMO_MODE==='1',lockRedis:lockOff!=='1'};
  }
  async prepararArena(livres:number,latitude:number,longitude:number){
    this.assertDemo();
    const free=await this.db.viatura.findMany({where:{status:'DISPONIVEL',turnos:{some:{fimEm:null}}}});
    const keep=new Set(rankViaturas(free,{latitude,longitude}).slice(0,livres).map(v=>v.id));
    const reserve=free.filter(v=>!keep.has(v.id)).map(v=>v.id);
    if(reserve.length)await this.db.viatura.updateMany({where:{id:{in:reserve},status:'DISPONIVEL'},data:{status:'INDISPONIVEL',versao:{increment:1}}});
    await this.emit('VIATURA','arena');return this.estadoArena();
  }
  async configurarArena(lockRedis:boolean){
    this.assertDemo();
    if(lockRedis)await this.redis.del(ARENA_LOCK_OFF);else await this.redis.set(ARENA_LOCK_OFF,'1','EX',1800);// expira sozinho em 30 min
    return this.estadoArena();
  }
  async restaurarArena(){
    this.assertDemo();
    await this.redis.del(ARENA_LOCK_OFF);
    await this.db.viatura.updateMany({where:{status:'INDISPONIVEL'},data:{status:'DISPONIVEL',versao:{increment:1}}});
    await this.emit('VIATURA','arena');return this.estadoArena();
  }
  async finalizar(input:{ocorrenciaId:string;acao:'CONCLUIDO'|'CANCELADO'}){
    if(!/^[0-9a-f-]{36}$/i.test(input.ocorrenciaId)||!['CONCLUIDO','CANCELADO'].includes(input.acao))throw new BadRequestException();
    const resultado=await this.db.$transaction(async tx=>{
      const despacho=await tx.despacho.findUnique({where:{ocorrenciaId:input.ocorrenciaId}});
      if(!despacho)return {status:'SEM_DESPACHO'};
      if(despacho.status==='CONCLUIDO'||despacho.status==='CANCELADO')return {status:despacho.status};
      await tx.despacho.update({where:{id:despacho.id},data:{versao:{increment:1},status:input.acao,concluidoEm:new Date(),simulacaoPausada:true}});
      await tx.viatura.updateMany({where:{id:despacho.viaturaId,status:{not:'DISPONIVEL'}},data:{status:'DISPONIVEL',versao:{increment:1}}});
      await tx.patrulha.updateMany({where:{viaturaId:despacho.viaturaId},data:{status:'ATIVA',rota:Prisma.DbNull,progresso:0,versao:{increment:1},inicioEm:new Date()}});
      await tx.outbox.create({data:{tipo:'DESPACHO_FINALIZADO',payload:{ocorrenciaId:input.ocorrenciaId,viaturaId:despacho.viaturaId,acao:input.acao}}});
      return {status:input.acao};
    });
    await this.emit('VIATURA',input.ocorrenciaId);return resultado;
  }
}
@Resolver('Viatura')
class ViaturaResolver {
  constructor(private readonly db:Database,private readonly dispatcher:DispatchService) {}
  @Query('preverDespacho') preverDespacho(@Context() ctx:any,@Args('latitude') latitude:number,@Args('longitude') longitude:number){requireAdmin(ctx);return forecast(this.db,latitude,longitude);}
  @Query('estatisticasViatura') async estatisticas(@Context() ctx:any,@Args('id') id:string,@Args('dataLocal') dataLocal?:string){
    requireAdmin(ctx);const range=dayRange(dataLocal);
    const [v,turno,iniciados,concluidos,cancelados]=await Promise.all([this.db.viatura.findUnique({where:{id}}),this.db.turnoViatura.findFirst({where:{viaturaId:id,fimEm:null}}),this.db.despacho.count({where:{viaturaId:id,despachadoEm:range}}),this.db.despacho.count({where:{viaturaId:id,status:'CONCLUIDO',concluidoEm:range}}),this.db.despacho.count({where:{viaturaId:id,status:'CANCELADO',concluidoEm:range}})]);
    const durations=await this.db.$queryRaw<Array<{total:number}>>`SELECT COALESCE(SUM(GREATEST(0,EXTRACT(EPOCH FROM LEAST("chegadaEm",${range.lt})-GREATEST("saidaEm",${range.gte})))),0)::float8 AS total FROM "Despacho" WHERE "viaturaId"=${id}::uuid AND "chegadaEm" IS NOT NULL AND "saidaEm" IS NOT NULL AND "saidaEm"<${range.lt} AND "chegadaEm">${range.gte}`;
    return {tempoTotalEmDeslocamentoHoje:durations[0].total,duracaoTurno:turno?Math.floor((Date.now()-turno.inicioEm.getTime())/1000):null,despachosIniciadosHoje:iniciados,atendimentosConcluidosHoje:concluidos,canceladosHoje:cancelados,operandoDesde:turno?.inicioEm?.toISOString(),ultimoSinalEm:v?.ultimoSinalEm?.toISOString(),situacaoSinal:!v?.ultimoSinalEm?'SEM_SINAL':Date.now()-v.ultimoSinalEm.getTime()>30000?'SEM_SINAL':Date.now()-v.ultimoSinalEm.getTime()>10000?'ATRASADO':'OK'};
  }
  @Query('despachosViatura') despachosViatura(@Context() ctx:any,@Args('id') id:string,@Args('cursor') cursor?:string,@Args('limit') limit=20){requireAdmin(ctx);return this.db.despacho.findMany({where:{viaturaId:id},orderBy:[{criadoEm:'desc'},{id:'desc'}],take:Math.min(100,Math.max(1,limit)),...(cursor?{cursor:{id:cursor},skip:1}:{})});}
  @Query('listarViaturas') async listarViaturas(@Context() ctx:any,@Args('status') status?:string){requireAdmin(ctx);return this.db.viatura.findMany({include:{patrulha:true,turnos:{where:{fimEm:null},take:1}},where:status?{status}:undefined,orderBy:{placa:'asc'}});}
  @Query('consultarViatura') async consultarViatura(@Context() ctx:any,@Args('id') id:string){requireAdmin(ctx);return this.db.viatura.findUnique({where:{id},include:{patrulha:true,turnos:{where:{fimEm:null},take:1}}});}
  @Query('listarDespachos') async listarDespachos(@Context() ctx:any){requireAdmin(ctx);return this.db.despacho.findMany({include:{viatura:true},orderBy:{criadoEm:'desc'},take:400});}
  @Query('consultarDespacho') async consultarDespacho(@Context() ctx:any,@Args('id') id:string){requireAdmin(ctx);return this.db.despacho.findUnique({where:{id},include:{viatura:true}});}
  @Query('estadoSimulacao') estadoSimulacao(@Context() ctx:any){requireAdmin(ctx);return this.dispatcher.getSimulation();}
  @Mutation('configurarSimulacao') configurarSimulacao(@Context() ctx:any,@Args('fator') fator:number,@Args('pausada') pausada:boolean){
    requireAdmin(ctx);if(!Number.isFinite(fator)||fator<1||fator>60)throw new BadRequestException('Fator deve estar entre 1 e 60');
    return this.dispatcher.setSimulation(fator,pausada);
  }
  @Query('estadoArena') estadoArena(@Context() ctx:any){requireAdmin(ctx);return this.dispatcher.estadoArena();}
  @Mutation('prepararArena') prepararArena(@Context() ctx:any,@Args('livres') livres:number,@Args('latitude') latitude:number,@Args('longitude') longitude:number){
    requireAdmin(ctx);this.dispatcher.assertDemo();
    if(!Number.isInteger(livres)||livres<1||livres>12||!validLatLon(latitude,longitude))throw new BadRequestException('Informe de 1 a 12 viaturas livres e um ponto válido');
    return this.dispatcher.prepararArena(livres,latitude,longitude);
  }
  @Mutation('configurarArena') configurarArena(@Context() ctx:any,@Args('lockRedis') lockRedis:boolean){requireAdmin(ctx);return this.dispatcher.configurarArena(lockRedis);}
  @Mutation('restaurarArena') restaurarArena(@Context() ctx:any){requireAdmin(ctx);return this.dispatcher.restaurarArena();}
  @Mutation('simularFalhaGps') simularFalhaGps(@Context() ctx:any,@Args('segundos') segundos:number){
    requireAdmin(ctx);if(!Number.isInteger(segundos)||segundos<1||segundos>120)throw new BadRequestException('Intervalo entre 1 e 120s');
    return this.dispatcher.signalLoss(segundos);
  }
  @Mutation('cadastrarViatura') async cadastrarViatura(@Context() ctx:any,@Args('input') input:any){
    requireAdmin(ctx);
    if(!isValidPlate(input.placa))throw new BadRequestException('Placa inválida. Use o formato ABC-1234 ou ABC1D23.');
    if(!validLatLon(input.latitude,input.longitude)||!Number.isInteger(input.capacidade)||input.capacidade<1||input.capacidade>8)throw new BadRequestException('Dados de viatura inválidos');
    // `codigo` (numero de referencia) e gerado pelo banco; a placa e normalizada e unica.
    const created=await this.db.viatura.create({data:{placa:normalizePlate(input.placa),latitude:input.latitude,longitude:input.longitude,capacidade:input.capacidade,turnos:{create:{iniciadoPor:'ADMIN'}}}}).catch((error:unknown)=>{if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throw new ConflictException('Já existe uma viatura cadastrada com esta placa.');throw error;});
    await this.dispatcher.emit('VIATURA',created.id);return created;
  }
  @Mutation('atualizarPosicaoViatura') async atualizarPosicaoViatura(@Context() ctx:any,@Args('id') id:string,@Args('latitude') latitude:number,@Args('longitude') longitude:number){
    requireAdmin(ctx);
    if(!validLatLon(latitude,longitude))throw new BadRequestException('Coordenadas inválidas');
    const count=await this.db.viatura.updateMany({where:{id,status:'DISPONIVEL'},data:{latitude,longitude,versao:{increment:1}}});
    if(!count.count)throw new ConflictException('Viatura ocupada ou inexistente');
    await this.dispatcher.emit('POSICAO',id);
    return this.db.viatura.findUnique({where:{id}});
  }
  @Mutation('pausarSimulacao') async pausarSimulacao(@Context() ctx:any,@Args('despachoId') despachoId:string,@Args('pausada') pausada:boolean){
    requireAdmin(ctx);
    const active=await this.db.despacho.findUnique({where:{id:despachoId}});
    if(!active||['CONCLUIDO','CANCELADO'].includes(active.status))throw new ConflictException('Despacho encerrado');
    const result=await this.db.despacho.update({where:{id:despachoId},data:{simulacaoPausada:pausada,previsaoChegadaEm:null,versao:{increment:1}}});
    await this.dispatcher.emit('DESPACHO',active.ocorrenciaId);return result;
  }
  @ResolveField('atualizadoEm') atualizadoEm(@Parent() v:any){return v.atualizadoEm?.toISOString()??null;}
  @ResolveField('ultimoSinalEm') ultimoSinalEm(@Parent() v:any){return v.ultimoSinalEm?.toISOString()??null;}
  @ResolveField('ultimaPosicaoEm') ultimaPosicaoEm(@Parent() v:any){return v.ultimaPosicaoEm?.toISOString()??null;}
  @ResolveField('ultimoMovimentoEm') ultimoMovimentoEm(@Parent() v:any){return v.ultimoMovimentoEm?.toISOString()??null;}
  @ResolveField('patrulhaRota') patrulhaRota(@Parent() v:any){return v.patrulha?.rota?JSON.stringify(v.patrulha.rota):null;}
  @ResolveField('patrulhaProgresso') patrulhaProgresso(@Parent() v:any){return v.patrulha?.progresso??null;}
  @ResolveField('operandoDesde') operandoDesde(@Parent() v:any){return v.turnos?.[0]?.inicioEm?.toISOString()??null;}
  @ResolveReference() async reference(ref:{id:string}){return this.db.viatura.findUnique({where:{id:ref.id}});}
}
@Resolver('Despacho')
class DespachoResolver {
 @ResolveField('previsaoChegadaInicialEm') previsaoChegadaInicialEm(@Parent() d:any){return d.previsaoChegadaInicialEm?.toISOString()??null;}
 @ResolveField('previsaoChegadaEm') previsaoChegadaEm(@Parent() d:any){return d.previsaoChegadaEm?.toISOString()??null;}
 @ResolveField('previsaoAtualizadaEm') previsaoAtualizadaEm(@Parent() d:any){return d.previsaoAtualizadaEm?.toISOString()??null;}
 @ResolveField('criadoEm') criadoEm(@Parent() d:any){return d.criadoEm?.toISOString()??null;}
 @ResolveField('concluidoEm') concluidoEm(@Parent() d:any){return d.concluidoEm?.toISOString()??null;}
 @ResolveField('chegadaEm') chegadaEm(@Parent() d:any){return d.chegadaEm?.toISOString()??null;}
 @ResolveField('saidaEm') saidaEm(@Parent() d:any){return d.saidaEm?.toISOString()??null;}
 @ResolveField('despachadoEm') despachadoEm(@Parent() d:any){return d.despachadoEm?.toISOString()??null;}
 @ResolveField('previsaoGeradaEm') previsaoGeradaEm(@Parent() d:any){return d.previsaoGeradaEm?.toISOString()??null;} @ResolveField('rota') rota(@Parent() despacho:any){return despacho.rota?JSON.stringify(despacho.rota):null;} }
@Controller('internal')
class InternalController {
  constructor(private readonly dispatch:DispatchService){}
  private auth(token:string){if(!process.env.INTERNAL_SERVICE_TOKEN||token!==process.env.INTERNAL_SERVICE_TOKEN)throw new UnauthorizedException();}
  @Post('dispatch') async dispatchCommand(@Headers('x-internal-token') token:string,@Body() input:any){this.auth(token);return this.dispatch.alocar(input);}
  @Post('finish') async finishCommand(@Headers('x-internal-token') token:string,@Body() input:any){this.auth(token);return this.dispatch.finalizar(input);}
}
@Module({imports:[GraphQLModule.forRoot<ApolloFederationDriverConfig>({driver:ApolloFederationDriver,typePaths:[join(__dirname,'schema.graphql')],context:({req}:any)=>({req}),introspection:process.env.NODE_ENV!=='production'})],providers:[Database,DispatchService,ViaturaResolver,DespachoResolver],controllers:[InternalController]})
class AppModule{}
async function bootstrap(){const app=await NestFactory.create(AppModule);app.enableShutdownHooks();app.use('/health',(_req:any,res:any)=>res.json({status:'ok'}));await app.listen(Number(process.env.PORT||4002),'0.0.0.0');}
bootstrap().catch(err=>{console.error(err);process.exitCode=1;});
