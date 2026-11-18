import {Moon,Sun} from 'lucide-react';
import type {Theme} from '../lib/theme';
/** O nome acessível descreve a ação ("Tema escuro" quando o tema atual é claro). */
export function ThemeToggle({theme,onToggle,className=''}:{theme:Theme;onToggle:()=>void;className?:string}){
 const next=theme==='dark'?'claro':'escuro';
 return <button type="button" className={`icon-button theme-toggle ${className}`} onClick={onToggle} aria-label={`Tema ${next}`} title={`Alternar para o tema ${next}`}>{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button>;
}
