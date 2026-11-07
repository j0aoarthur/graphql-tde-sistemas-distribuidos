// Integração com o ViaCEP (https://viacep.com.br). Dados públicos de endereço; nenhuma credencial é usada.
export type CepInfo={cep:string;logradouro:string;bairro:string;complemento:string};
const CITY='Feira de Santana',UF='BA';
const BASE='https://viacep.com.br/ws';
const digits=(v:string)=>v.replace(/\D/g,'');
const plain=(v:string)=>v.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
export const isCep=(v:string)=>/^\d{5}-?\d{3}$/.test(v.trim());
export function formatCep(v:string){const d=digits(v).slice(0,8);return d.length>5?`${d.slice(0,5)}-${d.slice(5)}`:d;}
function toInfo(x:any):CepInfo{return {cep:String(x.cep??''),logradouro:String(x.logradouro??''),bairro:String(x.bairro??''),complemento:String(x.complemento??'')};}
const inCity=(x:any)=>x&&!x.erro&&x.localidade===CITY&&x.uf===UF;

/** Consulta um CEP. Lança erro com mensagem apresentável quando indisponível ou fora de Feira de Santana. */
export async function lookupCep(cep:string,signal:AbortSignal):Promise<CepInfo>{
 const response=await fetch(`${BASE}/${digits(cep)}/json/`,{signal});
 if(!response.ok)throw Error('Consulta CEP indisponível. Use o pin.');
 const data=await response.json();
 if(!inCity(data))throw Error('CEP não encontrado na área de Feira de Santana');
 return toInfo(data);
}

const STREET_PREFIX=/^(rua|r\.|avenida|av\.?|travessa|tv\.?|alameda|pra[cç]a|rodovia|estrada|largo|viaduto)\s+/i;
/**
 * Descobre o CEP a partir do nome da rua (usado após clicar no mapa).
 * Só devolve resultado quando não há ambiguidade: ruas longas podem ter vários CEPs e,
 * nesse caso, o campo fica vazio para o operador preencher (não presumimos dados).
 */
export async function lookupStreetCep(street:string,bairro:string|undefined,signal:AbortSignal):Promise<CepInfo|null>{
 const name=street.trim().replace(STREET_PREFIX,'').trim();
 if(name.length<3)return null;
 try{
  const response=await fetch(`${BASE}/${UF}/${encodeURIComponent(CITY)}/${encodeURIComponent(name)}/json/`,{signal});
  if(!response.ok)return null;
  const data=await response.json();
  const all:CepInfo[]=(Array.isArray(data)?data:[]).filter(inCity).map(toInfo).filter(x=>/^\d{5}-?\d{3}$/.test(x.cep));
  const sameDistrict=bairro?all.filter(x=>plain(x.bairro)===plain(bairro)):[];
  const candidates=sameDistrict.length?sameDistrict:all;
  return new Set(candidates.map(x=>digits(x.cep))).size===1?candidates[0]:null;
 }catch{return null;}
}
