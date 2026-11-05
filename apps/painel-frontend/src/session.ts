let token='';
let refreshing:Promise<string>|null=null;
let generation=0;
export const accessToken=()=>token;
export async function sessionRequest(path:string,body:unknown={}){
 const response=await fetch(`/auth/${path}`,{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-sdv-csrf':'1'},body:JSON.stringify(body),cache:'no-store'});
 if(!response.ok)throw Object.assign(Error(response.status===401?'Sessão expirada. Entre novamente.':'Não foi possível atualizar a sessão.'),{status:response.status});
 return response.json();
}
export function refreshSession():Promise<string>{
 if(refreshing)return refreshing;
 const version=generation;
 const run=async()=>{for(let i=0;i<3;i++){try{const data=await sessionRequest('refresh');if(version!==generation)throw Error('Sessão encerrada');token=data.accessToken;return token;}catch(e){if((e as any).status!==409||i===2)throw e;await new Promise(r=>setTimeout(r,150));}}throw Error('Sessão indisponível');};
 const locks=navigator.locks;
 refreshing=Promise.resolve(locks?locks.request('sdv-session',run):run()).then(value=>value).catch(e=>{token='';window.dispatchEvent(new Event('sdv-session-expired'));throw e;}).finally(()=>{refreshing=null;});
 return refreshing;
}
export async function loginSession(email:string,senha:string){generation++;const data=await sessionRequest('login',{email,senha});token=data.accessToken;return token;}
export async function logoutSession(){generation++;await refreshing?.catch(()=>{});await sessionRequest('logout');token='';}
