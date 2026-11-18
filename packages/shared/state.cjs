/** Reconciliation never rolls a persisted entity back to an earlier version. */
function reconcileList(current=[],incoming=[]){
 const previous=new Map(current.map(x=>[x.id,x]));
 return incoming.map(value=>{const old=previous.get(value.id);if(!old)return value;if((old.versao??0)>(value.versao??0))return old;if((old.versao??0)===(value.versao??0)&&Date.parse(old.ultimoSinalEm??old.atualizadoEm??'')>Date.parse(value.ultimoSinalEm??value.atualizadoEm??''))return old;return value;});
}
module.exports={reconcileList};
