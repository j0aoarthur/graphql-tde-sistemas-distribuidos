import {useEffect,useState} from 'react';
import {gql} from '../api';
import {accessToken} from '../session';
export function FleetStatistics({id}:{id:string}){
 const[data,setData]=useState<any>(null),[error,setError]=useState(false);
 useEffect(()=>{let active=true;setData(null);setError(false);void gql<any>('query($id:ID!){estatisticasViatura(id:$id){despachosIniciadosHoje atendimentosConcluidosHoje canceladosHoje operandoDesde ultimoSinalEm situacaoSinal}}',{id},accessToken()).then(d=>{if(active)setData(d.estatisticasViatura);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[id]);
 if(error)return <p>Estatísticas do turno indisponíveis</p>;
 if(!data)return <p>Carregando estatísticas do turno…</p>;
 return <section className="detail-section"><h3>Turno e dia em America/Bahia</h3><div className="detail-facts"><div><span>Operando desde</span><b>{data.operandoDesde?new Date(data.operandoDesde).toLocaleString('pt-BR',{timeZone:'America/Bahia'}):'Turno não iniciado'}</b></div><div><span>Despachos iniciados hoje</span><b>{data.despachosIniciadosHoje}</b></div><div><span>Concluídos hoje</span><b>{data.atendimentosConcluidosHoje}</b></div><div><span>Cancelados hoje</span><b>{data.canceladosHoje}</b></div><div><span>Sinal</span><b>{data.situacaoSinal}</b></div></div></section>;
}
