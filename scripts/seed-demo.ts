import 'dotenv/config';
import { PrismaClient as OccPrisma } from '../apps/ocorrencias-service/src/generated/client';
import { PrismaClient as FleetPrisma } from '../apps/viaturas-service/src/generated/client';
import * as bcrypt from 'bcryptjs';
const a=new OccPrisma();const b=new FleetPrisma();
const coords=[[-12.255,-38.968],[-12.242,-38.955],[-12.273,-38.970],[-12.254,-38.989],[-12.263,-38.950],[-12.283,-38.962],[-12.240,-38.981],[-12.270,-38.941],[-12.251,-38.934],[-12.292,-38.985],[-12.228,-38.968],[-12.277,-39.000]];
async function run(){
 const password=process.env.DEMO_ADMIN_PASSWORD;
 if(!password||password.length<12) throw Error('Configure DEMO_ADMIN_PASSWORD (>=12 caracteres) em ambiente local');
 const hash=await bcrypt.hash(password,12);
 for(const [codigo,nome,email] of [['CENTRAL_A','Central Norte','central-a@sdv.local'],['CENTRAL_B','Central Sul','central-b@sdv.local']]){
  const central=await a.central.upsert({where:{codigo},update:{nome},create:{codigo,nome}});
  await a.admin.upsert({where:{email},update:{senhaHash:hash,ativo:true},create:{centralId:central.id,nome:`ADMIN ${codigo}`,email,senhaHash:hash,papel:'ADMIN'}});
 }
 for(let i=0;i<coords.length;i++){
  await b.viatura.upsert({where:{placa:`SDV${String(i+1).padStart(3,'0')}`},update:{},create:{placa:`SDV${String(i+1).padStart(3,'0')}`,latitude:coords[i][0],longitude:coords[i][1],status:'DISPONIVEL'}});
 }
 console.log('Seed idempotente: 2 centrais ADMIN e 12 viaturas fictícias em Feira de Santana.');
}
run().finally(async()=>{await Promise.all([a.$disconnect(),b.$disconnect()]);});
