import React,{useEffect,useRef} from 'react';
import {X} from 'lucide-react';
export type ModalSize='small'|'normal'|'large';
const FOCUSABLE='button:not(:disabled),input:not(:disabled),select,textarea:not(:disabled),[tabindex="0"]';
/** Diálogo acessível: foco preso, Esc e clique fora fecham, foco volta ao gatilho. Único mecanismo de diálogo do painel (sem alert/confirm/prompt). */
export function Modal({title,kicker,onClose,children,size='normal',dismissable=true}:{title:string;kicker:string;onClose:()=>void;children:React.ReactNode;size?:ModalSize;dismissable?:boolean}){
 const section=useRef<HTMLElement>(null),closeRef=useRef(onClose),dismissRef=useRef(dismissable);closeRef.current=onClose;dismissRef.current=dismissable;
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const root=section.current;
  (root?.querySelector<HTMLElement>('[data-autofocus]')??root?.querySelector<HTMLElement>('input,select,textarea')??root?.querySelector<HTMLElement>('button'))?.focus();
  const keyboard=(e:KeyboardEvent)=>{
   if(e.key==='Escape'&&dismissRef.current){e.stopPropagation();closeRef.current();}
   if(e.key==='Tab'){
    const nodes=Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE)??[]).filter(n=>n.getClientRects().length);
    const first=nodes[0],last=nodes.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  };
  window.addEventListener('keydown',keyboard);
  return()=>{window.removeEventListener('keydown',keyboard);if(previous?.isConnected)previous.focus();};
 },[]);
 return <div className="modal-backdrop" onMouseDown={e=>{if(dismissable&&e.target===e.currentTarget)onClose();}}>
  <section ref={section} role="dialog" aria-modal="true" aria-label={title} className={`modal modal--${size}`}>
   <header className="modal-header"><div><span className="eyebrow">{kicker}</span><h2>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20}/></button></header>
   {children}
  </section>
 </div>;
}
