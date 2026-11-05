for(const url of ['http://127.0.0.1:4000/health','http://localhost:5173','http://127.0.0.1:4011/health']){
 let ready=false;for(let i=0;i<60;i++){try{const response=await fetch(url,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,300));}if(!ready)throw Error(`Serviço de teste indisponível: ${url}`);
}
