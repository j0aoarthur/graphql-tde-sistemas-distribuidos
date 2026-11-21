import 'dotenv/config';
import { PrismaClient as OccPrisma } from '../apps/ocorrencias-service/src/generated/client';
import { PrismaClient as FleetPrisma } from '../apps/viaturas-service/src/generated/client';
import * as bcrypt from 'bcryptjs';
const a=new OccPrisma();const b=new FleetPrisma();
const coords=[[-12.255,-38.968],[-12.242,-38.955],[-12.273,-38.970],[-12.254,-38.989],[-12.263,-38.950],[-12.283,-38.962],[-12.240,-38.981],[-12.270,-38.941],[-12.251,-38.934],[-12.282317,-38.986755],[-12.228,-38.968],[-12.276786,-38.996008]];
async function run(){
 const password=process.env.DEMO_ADMIN_PASSWORD;
 if(!password||password.length<12) throw Error('Configure DEMO_ADMIN_PASSWORD (>=12 caracteres) em ambiente local');
 const hash=await bcrypt.hash(password,12);
 for(const [codigo,nome,email] of [['CENTRAL_A','Central Norte','central-a@sdv.local'],['CENTRAL_B','Central Sul','central-b@sdv.local']]){
  const central=await a.central.upsert({where:{codigo},update:{nome},create:{codigo,nome}});
  await a.admin.upsert({where:{email},update:{senhaHash:hash,ativo:true},create:{centralId:central.id,nome:`ADMIN ${codigo}`,email,senhaHash:hash,papel:'ADMIN'}});
  const prefix=codigo.toLowerCase().replace('_','-');
  await a.admin.upsert({where:{email:`supervisor-${prefix}@sdv.local`},update:{senhaHash:hash,ativo:true},create:{centralId:central.id,nome:`Supervisor ${nome}`,email:`supervisor-${prefix}@sdv.local`,senhaHash:hash,papel:'SUPERVISOR'}});
  await a.admin.upsert({where:{email:`operador-${prefix}@sdv.local`},update:{senhaHash:hash,ativo:true},create:{centralId:central.id,nome:`Operador ${nome}`,email:`operador-${prefix}@sdv.local`,senhaHash:hash,papel:'OPERADOR'}});
 }
 for(let i=0;i<coords.length;i++){
  const v=await b.viatura.upsert({where:{placa:`SDV${String(i+1).padStart(3,'0')}`},update:{},create:{placa:`SDV${String(i+1).padStart(3,'0')}`,latitude:coords[i][0],longitude:coords[i][1],status:'DISPONIVEL'}});
  const ativo=await b.turnoViatura.findFirst({where:{viaturaId:v.id,fimEm:null}});
  if(!ativo)await b.turnoViatura.create({data:{viaturaId:v.id,iniciadoPor:'SCRIPT'}});
 }
 console.log('Seed idempotente: 2 centrais (ADMIN, SUPERVISOR, OPERADOR) e 12 viaturas fictícias em Feira de Santana.');
}
run().finally(async()=>{await Promise.all([a.$disconnect(),b.$disconnect()]);});
