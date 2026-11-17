import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {CheckCircle2,Database,Hourglass,Layers,Lock,Maximize2,Minimize2,Play,RotateCcw,Server,ShieldCheck,Unlock,Zap,type LucideIcon} from 'lucide-react';
import {foldTrace,summarizeTrace,type TraceCall,type TraceEvent} from '@sdv/shared/trace';
import {OperationsMap} from '../../components/OperationsMap';
import {Priority} from '../../components/ui';
import {watchTrace} from '../../api';
import {ARENA_POINT,DISPATCHED,WAITING,cancelCall,chamadoNumero,duplicatedVehicles,fetchArena,fireCalls,isArenaIncident,isLive,prepareArena,restoreArena,setArenaLock,type ArenaState} from '../../lib/arena';
import {formatDuration} from '../../lib/time';
import type {Dispatch,Incident,Vehicle} from '../../types';
import './arena.css';

const vtr=(c?:number)=>c?`VTR-${String(c).padStart(3,'0')}`:'viatura';
const fmtMs=(ms:number|null)=>ms==null?'—':ms<1000?`${Math.round(ms)} ms`:formatDuration(ms/1000);
type Tone='info'|'warn'|'bad'|'ok'|'muted';
/** Traduz um passo do rastro em linguagem de operador/banca. */
function describe(e:TraceEvent):{tone:Tone;Icon:LucideIcon;text:string}{
 switch(e.passo){
  case 'WORKER_RECEBEU':return {tone:'info',Icon:Server,text:`${e.worker??'worker'} ${e.detalhe==='FILA'?'reprocessou da fila':'recebeu do stream'}`};
  case 'ALOCACAO_INICIADA':return {tone:'muted',Icon:Layers,text:`ranqueou${e.detalhe?` · ${e.detalhe}`:''}`};
  case 'LOCK_OCUPADO':return {tone:'warn',Icon:Lock,text:`Redis: ${vtr(e.viaturaCodigo)} em uso → próxima`};
  case 'CAS_PERDEU':return {tone:'warn',Icon:Database,text:`PostgreSQL: ${vtr(e.viaturaCodigo)} já tomada (CAS)`};
  case 'INDICE_RECUSOU':return {tone:'bad',Icon:ShieldCheck,text:`Índice único recusou ${vtr(e.viaturaCodigo)}`};
  case 'VENCEU':return {tone:'ok',Icon:CheckCircle2,text:`${vtr(e.viaturaCodigo)} alocada`};
  case 'JA_DESPACHADA':return {tone:'muted',Icon:CheckCircle2,text:'já despachada (idempotência)'};
  default:return {tone:'warn',Icon:Hourglass,text:'sem viatura livre → fila'};
 }
}
const workerSlot=(w?:string)=>{const n=Number(/(\d+)/.exec(w??'')?.[1]);return Number.isFinite(n)?n%4:0;};

type Shown={kind:'event';e:TraceEvent}|{kind:'retries';n:number;ts:string};
/** Colapsa tentativas ociosas da fila (reprocessou → 0 livres → sem viatura) em um só chip "↻ ×N", para a linha do tempo não virar ruído. */
function collapse(passos:TraceEvent[]):Shown[]{
 const attempts:TraceEvent[][]=[];
 for(const e of passos){if(e.passo==='WORKER_RECEBEU'||!attempts.length)attempts.push([e]);else attempts.at(-1)!.push(e);}
 const out:Shown[]=[];
 for(const a of attempts){
  const idle=a[0].passo==='WORKER_RECEBEU'&&a[0].detalhe==='FILA'&&a.every(e=>['WORKER_RECEBEU','ALOCACAO_INICIADA','SEM_VIATURA'].includes(e.passo))&&a.at(-1)!.passo==='SEM_VIATURA';
  const last=out.at(-1);
  if(idle){if(last?.kind==='retries'){last.n++;last.ts=a.at(-1)!.ts;}else out.push({kind:'retries',n:1,ts:a.at(-1)!.ts});}
  else for(const e of a)out.push({kind:'event',e});
 }
 return out;
}
function Lane({incident,call,vehicles}:{incident:Incident;call?:TraceCall;vehicles:Vehicle[]}){
 const num=chamadoNumero(incident),dispatched=DISPATCHED.includes(incident.status),waiting=WAITING.includes(incident.status);
 const vehicle=call?.viaturaCodigo?vehicles.find(v=>v.codigo===call.viaturaCodigo):undefined;
 const t0=call?Date.parse(call.iniciouEm):0;
 return <li className="arena-lane" data-state={dispatched?'won':waiting?'waiting':'pending'}>
  <div className="arena-lane-head">
   <b className="arena-lane-n">#{String(num).padStart(2,'0')}</b><Priority n={incident.prioridade}/>
   <span className="arena-lane-result">{dispatched?<><CheckCircle2 size={15} aria-hidden="true"/>{vtr(vehicle?.codigo??call?.viaturaCodigo??undefined)}</>:waiting?<><Hourglass size={15} aria-hidden="true"/>Em espera</>:'Processando…'}</span>
   {call?.duracaoMs!=null&&<small className="arena-lane-ms">{fmtMs(call.duracaoMs)}</small>}
  </div>
  <ol className="arena-steps" aria-label={`Etapas do chamado ${num}`}>
   {collapse(call?.passos??[]).map((item,i)=>{
    if(item.kind==='retries')return <li key={`r-${i}`} className="arena-step arena-step--muted" title="Cada ciclo: um worker reprocessa a fila e ainda não há viatura livre"><Hourglass size={13} aria-hidden="true"/><span>↻ {item.n} {item.n===1?'nova tentativa':'novas tentativas'} na fila (sem viatura livre)</span><small>+{Math.max(0,Date.parse(item.ts)-t0)} ms</small></li>;
    const e=item.e,d=describe(e);return <li key={`${e.passo}-${e.ts}-${i}`} className={`arena-step arena-step--${d.tone}`} data-worker={e.passo==='WORKER_RECEBEU'?workerSlot(e.worker):undefined}>
    <d.Icon size={13} aria-hidden="true"/><span>{d.text}</span><small>+{Math.max(0,Date.parse(e.ts)-t0)} ms</small></li>;})}
   {!call&&<li className="arena-step arena-step--muted"><Hourglass size={13} aria-hidden="true"/><span>aguardando um worker…</span></li>}
  </ol>
 </li>;
}

export function ArenaPage({token,vehicles,incidents,dispatches,onRefresh,notify}:{token:string;vehicles:Vehicle[];incidents:Incident[];dispatches:Dispatch[];onRefresh:()=>void;notify:(message:string,error?:boolean)=>void}){
 const[est,setEst]=useState<ArenaState|null>(null),[estError,setEstError]=useState('');
 const[n,setN]=useState(8),[k,setK]=useState(3),[mix,setMix]=useState(true);
 const[busy,setBusy]=useState<''|'prep'|'fire'|'release'|'reset'|'lock'>('');
 const[events,setEvents]=useState<TraceEvent[]>([]),[trace,setTrace]=useState<'connected'|'off'|'disabled'>('off');
 const[presenter,setPresenter]=useState(false);
 const tokenRef=useRef(token);tokenRef.current=token;

 const loadState=useCallback(async()=>{try{setEst(await fetchArena(tokenRef.current));setEstError('');}catch(e){setEstError(String((e as Error).message||e));}},[]);
 useEffect(()=>{void loadState();const t=setInterval(()=>void loadState(),3000);return()=>clearInterval(t);},[loadState]);
 useEffect(()=>watchTrace(e=>setEvents(prev=>prev.length>3000?[...prev.slice(-2000),e]:[...prev,e]),setTrace),[]);

 const arena=useMemo(()=>incidents.filter(i=>isArenaIncident(i)&&isLive(i)).sort((a,b)=>chamadoNumero(a)-chamadoNumero(b)),[incidents]);
 const ids=useMemo(()=>new Set(arena.map(i=>i.id)),[arena]);
 const calls=useMemo(()=>foldTrace(events.filter(e=>ids.has(e.ocorrenciaId))),[events,ids]);
 const callById=useMemo(()=>new Map(calls.map(c=>[c.ocorrenciaId,c])),[calls]);
 const sum=useMemo(()=>summarizeTrace(calls),[calls]);
 const dupes=duplicatedVehicles(dispatches),dispatched=arena.filter(i=>DISPATCHED.includes(i.status)).length,waiting=arena.filter(i=>WAITING.includes(i.status)).length;
 const firstTs=calls.length?Math.min(...calls.map(c=>Date.parse(c.iniciouEm))):0;
 const lastTs=calls.length?Math.max(...calls.flatMap(c=>c.passos.map(p=>Date.parse(p.ts)))):0;
 const reprocessed=calls.some(c=>c.passos.some(p=>p.detalhe==='FILA'));
 const settled=arena.length>0&&dispatched+waiting===arena.length&&!reprocessed;
 const ready=!!est?.modoDemo&&est.rastroAtivo&&!estError;

 async function run(kind:typeof busy,fn:()=>Promise<string|void>){
  if(busy)return;setBusy(kind);
  try{const msg=await fn();if(msg)notify(msg);}catch(e){notify(String((e as Error).message||e),true);}
  finally{setBusy('');await loadState();onRefresh();}
 }
 const prepare=()=>run('prep',async()=>{const s=await prepareArena(token,k);return `Cenário pronto: ${s.livres} viatura(s) livre(s), ${s.reservadas} reservada(s).`;});
 const fire=()=>run('fire',async()=>{setEvents([]);const r=await fireCalls(token,n,mix);return r.failed?`${r.ok} chamados abertos, ${r.failed} falharam.`:`${r.ok} chamados abertos ao mesmo tempo.`;});
 const release=()=>run('release',async()=>{
  const target=arena.find(i=>DISPATCHED.includes(i.status));if(!target)return 'Nenhuma viatura despachada para liberar.';
  await cancelCall(token,target.id,'Liberando viatura na demonstração da Arena');return `Chamado #${String(chamadoNumero(target)).padStart(2,'0')} cancelado: a viatura volta e o próximo da fila entra.`;
 });
 const reset=()=>run('reset',async()=>{
  await Promise.allSettled(arena.map(i=>cancelCall(token,i.id,'Reinício do cenário da Arena')));
  await restoreArena(token);setEvents([]);return 'Cenário reiniciado: viaturas restauradas e chamados da Arena cancelados.';
 });
 const toggleLock=()=>run('lock',async()=>{const s=await setArenaLock(token,!est?.lockRedis);return s.lockRedis?'Lock do Redis ligado.':'Lock do Redis desligado: agora só o PostgreSQL decide.';});

 // Modo apresentação: sobreposição de tela cheia, atalhos de teclado e Esc para sair.
 const actions=useRef({prepare,fire,release,reset});actions.current={prepare,fire,release,reset};
 useEffect(()=>{
  if(!presenter)return;
  const onKey=(e:KeyboardEvent)=>{
   const t=e.target as HTMLElement|null;if(t&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||e.metaKey||e.ctrlKey||e.altKey)return;
   const key=e.key.toLowerCase();
   if(key==='escape')setPresenter(false);else if(key==='p')void actions.current.prepare();else if(key==='d')void actions.current.fire();else if(key==='l')void actions.current.release();else if(key==='r')void actions.current.reset();
  };
  addEventListener('keydown',onKey);const prev=document.body.style.overflow;document.body.style.overflow='hidden';
  return()=>{removeEventListener('keydown',onKey);document.body.style.overflow=prev;};
 },[presenter]);
 const togglePresenter=()=>setPresenter(p=>{const next=!p;try{if(next)void document.documentElement.requestFullscreen?.();else if(document.fullscreenElement)void document.exitFullscreen();}catch{/* tela cheia é opcional */}return next;});

 const narration=arena.length?`${dispatched} chamados despachados, ${waiting} em espera, ${dupes.length} viaturas com despacho duplicado.`:'Nenhum chamado da arena ativo.';
 const lockOff=est?.lockRedis===false;

 return <section className={`arena${presenter?' arena--presenter':''}`} aria-label="Arena de concorrência">
  <header className="arena-head">
   <div><span className="arena-eyebrow">DEMONSTRAÇÃO · SISTEMAS DISTRIBUÍDOS</span>{presenter&&<h2>Arena de concorrência</h2>}<p>{n} chamados simultâneos disputando {k} viaturas livres, com {est?.workers??'—'} worker(s) consumindo o mesmo stream. Quem decide é o PostgreSQL.</p></div>
   <button type="button" className="btn btn-outline" onClick={togglePresenter} aria-pressed={presenter}>{presenter?<><Minimize2 size={16}/> Sair da apresentação</>:<><Maximize2 size={16}/> Modo apresentação</>}</button>
  </header>

  {!ready&&<div className="arena-notice" role="alert">
   <strong>A Arena precisa do ambiente de demonstração.</strong>
   <span>{estError?`Não foi possível consultar o estado (${estError}).`:est&&!est.modoDemo?'O backend está sem SDV_DEMO_MODE=1.':est&&!est.rastroAtivo?'O backend está sem SDV_DEMO_TRACE=1.':'Carregando…'} Rode <code>npm run demo:arena</code> e recarregue.</span>
  </div>}
  {ready&&trace==='disabled'&&<div className="arena-notice" role="status"><span>O gateway recusou o rastro (SDV_DEMO_TRACE desligado). A linha do tempo não será exibida.</span></div>}
  {ready&&est!.workers<2&&<div className="arena-notice arena-notice--soft" role="status"><span>Só há {est!.workers} worker ativo: sem corrida real entre workers. Rode <code>npm run demo:arena</code> (3 workers).</span></div>}

  <div className="arena-controls">
   <div className="arena-step-card"><span className="arena-step-n">1</span><div><strong>Preparar cenário</strong><label className="arena-range"><span>Viaturas livres: <b>{k}</b></span><input type="range" min={1} max={12} value={k} onChange={e=>setK(Number(e.target.value))} disabled={!ready||!!busy}/></label></div>
    <button type="button" className="btn btn-outline" onClick={prepare} disabled={!ready||!!busy}><RotateCcw size={15}/> {busy==='prep'?'Preparando…':'Preparar'}</button></div>
   <div className="arena-step-card"><span className="arena-step-n">2</span><div><strong>Disparar chamados</strong><label className="arena-range"><span>Chamados simultâneos: <b>{n}</b></span><input type="range" min={2} max={30} value={n} onChange={e=>setN(Number(e.target.value))} disabled={!ready||!!busy}/></label>
    <label className="arena-check"><input type="checkbox" checked={mix} onChange={e=>setMix(e.target.checked)} disabled={!ready||!!busy}/> Misturar prioridades</label></div>
    <button type="button" className="btn btn-primary" onClick={fire} disabled={!ready||!!busy}><Zap size={15}/> {busy==='fire'?'Disparando…':`Disparar ${n}`}</button></div>
   <div className="arena-step-card"><span className="arena-step-n">3</span><div><strong>Liberar uma viatura</strong><small className="arena-hint">A viatura volta e o primeiro da fila (maior prioridade, depois o mais antigo) entra na hora.</small></div>
    <button type="button" className="btn btn-outline" onClick={release} disabled={!ready||!!busy||!dispatched}><Play size={15}/> Liberar</button></div>
   <div className="arena-side-actions">
    <button type="button" className={`arena-toggle${lockOff?' arena-toggle--off':''}`} onClick={toggleLock} disabled={!ready||!!busy} aria-pressed={!lockOff}>
     {lockOff?<Unlock size={15}/>:<Lock size={15}/>} Lock do Redis: <b>{lockOff?'desligado':'ligado'}</b></button>
    <button type="button" className="btn btn-outline" onClick={reset} disabled={!ready||!!busy}>{busy==='reset'?'Reiniciando…':'Reiniciar cenário'}</button>
   </div>
  </div>
  {lockOff&&<div className="arena-notice arena-notice--soft" role="status"><span><b>Lock do Redis desligado (só demonstração).</b> Os workers disputam direto no PostgreSQL: veja o CAS barrando tentativas e a duplicidade continuar em zero.</span></div>}
  {presenter&&<p className="arena-keys">Atalhos: <kbd>P</kbd> preparar · <kbd>D</kbd> disparar · <kbd>L</kbd> liberar · <kbd>R</kbd> reiniciar · <kbd>Esc</kbd> sair</p>}

  <div className="arena-score" role="group" aria-label="Placar">
   <div className="arena-tile"><span>Chamados</span><b>{arena.length}</b></div>
   <div className="arena-tile"><span>Viaturas livres</span><b>{est?.livres??'—'}</b><small>{est?`${est.reservadas} reservadas`:''}</small></div>
   <div className="arena-tile arena-tile--ok"><span>Despachados</span><b>{dispatched}</b></div>
   <div className="arena-tile arena-tile--warn"><span>Em espera</span><b>{waiting}</b></div>
   <div className={`arena-tile ${dupes.length?'arena-tile--bad':'arena-tile--ok'}`}><span>Viaturas duplicadas</span><b>{dupes.length}</b><small>{dupes.length?'ERRO: investigar':'garantido pelo banco'}</small></div>
   <div className="arena-tile"><span>Decisão (p50 / p95)</span><b className="arena-tile-sm">{fmtMs(sum.p50Ms)} / {fmtMs(sum.p95Ms)}</b><small>{settled&&lastTs?`tudo resolvido em ${fmtMs(lastTs-firstTs)}`:''}</small></div>
  </div>
  <p className="sr-only" aria-live="polite">{narration}</p>

  <div className="arena-main">
   <div className="arena-map" aria-label="Mapa da arena"><OperationsMap vehicles={vehicles} incidents={arena} dispatches={dispatches} showAllRoutes focus={ARENA_POINT} zoom={14} compactLegend incidentLabel={o=>String(chamadoNumero(o)||'!')}/></div>
   <div className="arena-lanes-wrap"><h3>Linha do tempo por chamado</h3>
    {arena.length?<ul className="arena-lanes" tabIndex={0} aria-label="Linha do tempo dos chamados (role para ver todos)">{arena.map(i=><Lane key={i.id} incident={i} call={callById.get(i.id)} vehicles={vehicles}/>)}</ul>:<p className="arena-empty">Prepare o cenário e dispare os chamados para ver a disputa acontecer.</p>}
   </div>
  </div>

  <div className="arena-defense">
   <h3>Quem impediu a duplicidade?</h3>
   <ol className="arena-layers">
    <li className={`arena-layer${lockOff?' arena-layer--off':''}`}><Lock size={18} aria-hidden="true"/><div><span className="arena-tag">Otimização</span><strong>Lock no Redis</strong><small>{lockOff?'desligado nesta demonstração':'evita disputa desnecessária'}</small></div><b>{sum.bloqueios.lock}</b></li>
    <li className="arena-layer arena-layer--main"><Database size={18} aria-hidden="true"/><div><span className="arena-tag arena-tag--main">Quem decide</span><strong>UPDATE condicional (CAS)</strong><small><code>WHERE status = 'DISPONIVEL'</code></small></div><b>{sum.bloqueios.cas}</b></li>
    <li className="arena-layer"><ShieldCheck size={18} aria-hidden="true"/><div><span className="arena-tag">Rede final</span><strong>Índice único parcial</strong><small><code>uq_viatura_despacho_ativo</code></small></div><b>{sum.bloqueios.indice}</b></li>
   </ol>
   <div className="arena-proof"><div><span className="arena-tag">Prova no banco</span>
    <pre><code>{`SELECT "viaturaId", count(*) FROM "Despacho"\nWHERE status IN ('CONFIRMADO','EM_DESLOCAMENTO','NO_LOCAL','EM_ATENDIMENTO')\nGROUP BY 1 HAVING count(*) > 1;`}</code></pre></div>
    <div className={`arena-proof-result${dupes.length?' arena-proof-result--bad':''}`}><b>{dupes.length}</b><span>{dupes.length===1?'linha':'linhas'}</span><small>calculado ao vivo sobre os despachos ativos</small></div></div>
   <p className="arena-disclaimer">Simulação acadêmica: viaturas, chamados e telemetria são fictícios. O mapa usa ruas reais de Feira de Santana. Não é um sistema de despacho real.</p>
  </div>
 </section>;
}
