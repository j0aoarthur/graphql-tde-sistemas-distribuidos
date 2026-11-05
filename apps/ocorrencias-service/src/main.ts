import 'reflect-metadata';
import { sessionRoutes } from './session';
import { Module, Injectable, OnModuleInit, OnModuleDestroy, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GraphQLModule, Resolver, Query, Mutation, Args, Context, ResolveField, Parent, ResolveReference } from '@nestjs/graphql';
import { ApolloFederationDriver, ApolloFederationDriverConfig } from '@nestjs/apollo';
import { PrismaClient, Prisma } from './generated/client';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { join } from 'node:path';

@Injectable()
class Database extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
function authenticate(context: any): { adminId: string; centralId: string; papel: string } {
  const token = String(context.req?.headers?.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new UnauthorizedException('Autenticação necessária');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (decoded.papel !== 'ADMIN' || !decoded.sub || !decoded.centralId) throw Error('Invalid claims');
    return {adminId:String(decoded.sub), centralId:String(decoded.centralId), papel:String(decoded.papel)};
  } catch { throw new UnauthorizedException('Token inválido'); }
}
function validate(input: any) {
  if (typeof input.tipo !== 'string' || input.tipo.trim().length < 3 || input.tipo.length > 100) throw new BadRequestException('Tipo inválido');
  if (!Number.isInteger(input.prioridade) || input.prioridade < 1 || input.prioridade > 5) throw new BadRequestException('Prioridade deve estar entre 1 e 5');
  if (!Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90 || !Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180) throw new BadRequestException('Coordenadas inválidas');
  if (typeof input.clientRequestId !== 'string' || input.clientRequestId.length < 8 || input.clientRequestId.length > 100) throw new BadRequestException('Chave de idempotência inválida');
}
@Resolver('Ocorrencia')
class OcorrenciaResolver {
  constructor(private readonly db: Database) {}
  @Mutation('login')
  async login(@Args('email') email: string, @Args('senha') senha: string) {
    const user=await this.db.admin.findUnique({where:{email:email.toLowerCase().trim()},include:{central:true}});
    if(!user || !user.ativo || !user.central.ativo || !await bcrypt.compare(senha,user.senhaHash)) throw new UnauthorizedException('Credenciais inválidas');
    const secret=process.env.JWT_SECRET;
    if (!secret || secret.length < 32) throw Error('JWT_SECRET não configurado');
    const accessToken=jwt.sign({centralId:user.centralId,papel:user.papel},secret,{subject:user.id,expiresIn:'15m',algorithm:'HS256'});
    return {accessToken,admin:{id:user.id,centralId:user.centralId,nome:user.nome,email:user.email,papel:user.papel}};
  }
  @Query('me')
  async me(@Context() ctx: any) {
    const p=authenticate(ctx); const user=await this.db.admin.findUnique({where:{id:p.adminId}});
    if(!user?.ativo) throw new UnauthorizedException();
    return user;
  }
  @Query('listarCentrais') listarCentrais(@Context() ctx:any){authenticate(ctx);return this.db.central.findMany({orderBy:{codigo:'asc'}});}
  @Query('listarOcorrencias')
  async listarOcorrencias(@Context() ctx: any, @Args('status') status?:string) {
    authenticate(ctx);
    return this.db.ocorrencia.findMany({where:status?{status}:undefined,orderBy:{criadoEm:'desc'},take:400});
  }
  @Query('consultarOcorrencia')
  async consultarOcorrencia(@Context() ctx: any,@Args('id') id:string) {authenticate(ctx);return this.db.ocorrencia.findUnique({where:{id}});}
  @Mutation('abrirOcorrencia')
  async abrirOcorrencia(@Context() ctx: any, @Args('input') input: any) {
    const p=authenticate(ctx); validate(input);
    const key={centralId_clientRequestId:{centralId:p.centralId,clientRequestId:input.clientRequestId}};
    const previous=await this.db.ocorrencia.findUnique({where:key});
    if(previous) {if(previous.tipo!==input.tipo || previous.prioridade!==input.prioridade || previous.latitude!==input.latitude || previous.longitude!==input.longitude) throw new ConflictException('Chave de idempotência reutilizada com outro payload');return previous;}
    try {
      return await this.db.$transaction(async tx => {
        const ocorrencia=await tx.ocorrencia.create({data:{centralId:p.centralId,clientRequestId:input.clientRequestId,tipo:input.tipo,prioridade:input.prioridade,latitude:input.latitude,longitude:input.longitude,status:'RECEBIDA'}});
        await tx.outbox.create({data:{tipo:'OCORRENCIA_RECEBIDA',payload:{ocorrenciaId:ocorrencia.id,latitude:ocorrencia.latitude,longitude:ocorrencia.longitude}}});
        return ocorrencia;
      });
    } catch(err) {
      if(err instanceof Prisma.PrismaClientKnownRequestError && err.code==='P2002') {
        const concurrent=await this.db.ocorrencia.findUnique({where:key}); if(concurrent) {if(concurrent.tipo!==input.tipo || concurrent.prioridade!==input.prioridade || concurrent.latitude!==input.latitude || concurrent.longitude!==input.longitude) throw new ConflictException('Chave de idempotência reutilizada com outro payload');return concurrent;}
      }
      throw err;
    }
  }
  @Mutation('encerrarOcorrencia') async encerrarOcorrencia(@Context() ctx:any,@Args('id') id:string){
    authenticate(ctx);
    return this.db.$transaction(async tx=>{
      const oc=await tx.ocorrencia.findUnique({where:{id}});
      if(!oc) throw new BadRequestException('Ocorrência não encontrada');
      if(oc.status==='ENCERRADA'||oc.status==='ENCERRAMENTO_PENDENTE') return oc;
      if(oc.status!=='EM_ATENDIMENTO'&&oc.status!=='DESPACHADA') throw new ConflictException('Ocorrência ainda não foi despachada');
      const updated=await tx.ocorrencia.update({where:{id},data:{status:'ENCERRAMENTO_PENDENTE'}});
      await tx.outbox.create({data:{tipo:'OCORRENCIA_FECHAR',payload:{ocorrenciaId:id,acao:'CONCLUIDO'}}});
      return updated;
    });
  }
  @Mutation('cancelarOcorrencia') async cancelarOcorrencia(@Context() ctx:any,@Args('id') id:string){
    authenticate(ctx);
    return this.db.$transaction(async tx=>{
      const oc=await tx.ocorrencia.findUnique({where:{id}});
      if(!oc) throw new BadRequestException('Ocorrência não encontrada');
      if(oc.status==='CANCELADA'||oc.status==='CANCELAMENTO_PENDENTE') return oc;
      if(oc.status==='ENCERRADA'||oc.status==='ENCERRAMENTO_PENDENTE') throw new ConflictException('Ocorrência já finalizada');
      const updated=await tx.ocorrencia.update({where:{id},data:{status:'CANCELAMENTO_PENDENTE'}});
      await tx.outbox.create({data:{tipo:'OCORRENCIA_FECHAR',payload:{ocorrenciaId:id,acao:'CANCELADO'}}});
      return updated;
    });
  }
  @ResolveField('viatura') viatura(@Parent() ocorrencia: {viaturaId:string|null}) {return ocorrencia.viaturaId?{__typename:'Viatura',id:ocorrencia.viaturaId}:null;}
  @ResolveReference() async reference(ref:{id:string}){return this.db.ocorrencia.findUnique({where:{id:ref.id}});}
}
@Module({imports:[GraphQLModule.forRoot<ApolloFederationDriverConfig>({driver:ApolloFederationDriver,typePaths:[join(__dirname,'schema.graphql')],context:({req}:any)=>({req}),introspection:process.env.NODE_ENV!=='production'})],providers:[Database,OcorrenciaResolver]})
class AppModule {}
async function bootstrap(){const app=await NestFactory.create(AppModule);app.enableShutdownHooks();app.use(require('express').json({limit:'16kb'}));sessionRoutes(app.getHttpAdapter().getInstance(),app.get(Database));app.use('/health',(_req:any,res:any)=>res.json({status:'ok'}));await app.listen(Number(process.env.PORT||4001),'0.0.0.0');}
bootstrap().catch(err=>{console.error(err);process.exitCode=1;});
