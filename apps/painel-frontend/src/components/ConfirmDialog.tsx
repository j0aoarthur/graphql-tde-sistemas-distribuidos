import {useId,useState} from 'react';
import {AlertTriangle,Check,type LucideIcon} from 'lucide-react';
import {Modal} from './Modal';
export type ConfirmRequest={
 title:string;kicker:string;message:string;confirmLabel:string;cancelLabel?:string;tone?:'danger'|'primary';icon?:LucideIcon;
 /** Quando presente, pede um texto (ex.: justificativa) antes de confirmar. */
 reason?:{label:string;placeholder?:string;maxLength?:number;required?:boolean;help?:string};
 onConfirm:(reason:string)=>Promise<boolean|void>|boolean|void;
};
/** Substitui window.confirm / window.prompt. A confirmação só fecha quando a ação termina com sucesso. */
export function ConfirmDialog({request,onClose}:{request:ConfirmRequest;onClose:()=>void}){
 const[reason,setReason]=useState(''),[busy,setBusy]=useState(false),id=useId();
 const{reason:reasonConfig,tone='primary',icon:Icon=tone==='danger'?AlertTriangle:Check}=request;
 const trimmed=reason.trim(),missing=!!reasonConfig?.required&&!trimmed;
 async function submit(e:React.FormEvent){
  e.preventDefault();if(missing||busy)return;
  setBusy(true);
  try{const result=await request.onConfirm(trimmed);if(result!==false)onClose();}finally{setBusy(false);}
 }
 return <Modal title={request.title} kicker={request.kicker} size="small" onClose={onClose} dismissable={!busy}>
  <form onSubmit={submit} noValidate>
   <div className="modal-content confirm-body">
    <div className={`confirm-icon confirm-icon--${tone}`} aria-hidden="true"><Icon size={22}/></div>
    <div className="confirm-text">
     <p>{request.message}</p>
     {reasonConfig&&<div className="field-block"><label htmlFor={`${id}-reason`} className="field-caption">{reasonConfig.label}{reasonConfig.required&&<span className="required-mark" aria-hidden="true"> *</span>}</label>
      <textarea id={`${id}-reason`} className="confirm-textarea" rows={3} maxLength={reasonConfig.maxLength??500} value={reason} onChange={e=>setReason(e.target.value)} placeholder={reasonConfig.placeholder} aria-required={reasonConfig.required} aria-describedby={`${id}-help`}/>
      <div id={`${id}-help`} className="field-foot"><span>{reasonConfig.help??''}</span><span>{reason.length}/{reasonConfig.maxLength??500}</span></div></div>}
    </div>
   </div>
   <footer className="modal-actions">
    <button type="button" className="btn btn-outline" data-autofocus={reasonConfig?undefined:''} onClick={onClose} disabled={busy}>{request.cancelLabel??'Voltar'}</button>
    <button type="submit" className={`btn ${tone==='danger'?'btn-danger':'btn-primary'}`} disabled={busy||missing} aria-disabled={busy||missing}>{busy?'Processando…':request.confirmLabel}</button>
   </footer>
  </form>
 </Modal>;
}
