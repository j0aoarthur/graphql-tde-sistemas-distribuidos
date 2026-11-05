import { randomBytes, createHash, createHmac } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const cookieName='sdv_refresh';
const cookie=(value:string,age:number)=>`${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/auth; Max-Age=${age}${process.env.NODE_ENV==='production'?'; Secure':''}`;
const tokenFrom=(req:any)=>String(req.headers.cookie??'').split(';').map((x:string)=>x.trim()).find((x:string)=>x.startsWith(`${cookieName}=`))?.slice(cookieName.length+1)??'';
export function sessionRoutes(app:any,db:any){
  // JSON + explicit same-origin header prevent cross-site form requests. Never trust forwarded Origin.
  app.use('/auth',(req:any,res:any,next:any)=>{
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST'||req.headers['x-sdv-csrf']!=='1'||!req.is('application/json'))return res.status(403).json({error:'Solicitação de sessão inválida'});
    const origins=(process.env.FRONTEND_ORIGIN??'http://localhost:5173').split(',');
    if(req.headers.origin&&!origins.includes(req.headers.origin))return res.status(403).json({error:'Origem inválida'});
    next();
  });
  const issue=(user:any)=>{
    const secret=process.env.JWT_SECRET;
    if(!secret||secret.length<32)throw Error('JWT_SECRET não configurado');
    return {accessToken:jwt.sign({centralId:user.centralId,papel:user.papel},secret,{subject:user.id,expiresIn:'15m',algorithm:'HS256'})};
  };
  const attempts=new Map<string,{count:number;until:number}>();
  app.post('/auth/login',async(req:any,res:any,next:any)=>{try{
    const key=hash(`${req.ip}:${String(req.body?.email??'').trim().toLowerCase().slice(0,255)}`);const now=Date.now();
    if(attempts.size>10000)for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
    const limit=attempts.get(key);if(limit&&limit.until>now&&limit.count>=20)return res.status(429).json({error:'Tente novamente em alguns minutos'});
    attempts.set(key,{count:limit&&limit.until>now?limit.count+1:1,until:limit&&limit.until>now?limit.until:now+60000});
    const {email,senha}=req.body??{};
    if(typeof email!=='string'||typeof senha!=='string'||email.length>255||senha.length>256)return res.status(400).json({error:'Credenciais inválidas'});
    const user=await db.admin.findUnique({where:{email:email.trim().toLowerCase()},include:{central:true}});
    if(!user?.ativo||!user.central.ativo||!await bcrypt.compare(senha,user.senhaHash))return res.status(401).json({error:'Credenciais inválidas'});
    const result=issue(user),raw=randomBytes(32).toString('hex');
    await db.sessao.create({data:{adminId:user.id,tokenHash:hash(raw),expiraEm:new Date(now+7*86400000),eventos:{create:{tipo:'LOGIN'}}}});
    res.setHeader('Set-Cookie',cookie(raw,7*86400));res.json(result);
  }catch(e){next(e);}});
  app.post('/auth/refresh',async(req:any,res:any,next:any)=>{try{
    const raw=tokenFrom(req);if(!/^[a-f0-9]{64}$/.test(raw))return res.status(401).json({error:'Sessão ausente'});
    const current=await db.sessao.findUnique({where:{tokenHash:hash(raw)},include:{admin:{include:{central:true}}}});
    if(!current){
      // A concurrent tab may have just rotated. Do not clear its new cookie.
      const previous=await db.sessao.findFirst({where:{anteriorHash:hash(raw),revogadoEm:null},include:{admin:{include:{central:true}}}});
      if(previous&&Date.now()-previous.rotacionadoEm.getTime()<5000&&previous.expiraEm.getTime()>Date.now()&&previous.admin.ativo&&previous.admin.central.ativo){
        const replacement=createHmac('sha256',process.env.JWT_SECRET!).update(raw).digest('hex');
        if(hash(replacement)===previous.tokenHash){res.setHeader('Set-Cookie',cookie(replacement,Math.floor((previous.expiraEm.getTime()-Date.now())/1000)));return res.json(issue(previous.admin));}
      }
      const used=await db.sessaoToken.findUnique({where:{tokenHash:hash(raw)}});
      const sessionId=previous?.id??used?.sessaoId;
      if(sessionId)await db.sessao.update({where:{id:sessionId},data:{revogadoEm:new Date(),eventos:{create:{tipo:'REUSO_TOKEN_REVOGADO'}}}});
      return res.status(401).json({error:'Sessão inválida'});
    }
    if(current.revogadoEm||current.expiraEm.getTime()<=Date.now()||!current.admin.ativo||!current.admin.central.ativo)return res.status(401).json({error:'Sessão expirada'});
    const result=issue(current.admin),replacement=createHmac('sha256',process.env.JWT_SECRET!).update(raw).digest('hex');
    const changed=await db.$transaction(async(tx:any)=>{
      const result=await tx.sessao.updateMany({where:{id:current.id,tokenHash:hash(raw),revogadoEm:null},data:{tokenHash:hash(replacement),anteriorHash:hash(raw),rotacionadoEm:new Date()}});
      if(result.count){await tx.sessaoToken.create({data:{tokenHash:hash(raw),sessaoId:current.id}});await tx.eventoSessao.create({data:{sessaoId:current.id,tipo:'REFRESH'}});}return result;
    });
    if(!changed.count)return res.status(409).json({error:'Rotação concorrente'});
    res.setHeader('Set-Cookie',cookie(replacement,Math.max(0,Math.floor((current.expiraEm.getTime()-Date.now())/1000))));res.json(result);
  }catch(e){next(e);}});
  app.post('/auth/logout',async(req:any,res:any,next:any)=>{try{
    const digest=hash(tokenFrom(req));await db.sessao.updateMany({where:{OR:[{tokenHash:digest},{anteriorHash:digest},{tokens:{some:{tokenHash:digest}}}]},data:{revogadoEm:new Date()}});
    res.setHeader('Set-Cookie',cookie('',0));res.json({ok:true});
  }catch(e){next(e);}});
}
