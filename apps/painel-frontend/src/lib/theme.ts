import {createContext,useCallback,useContext,useEffect,useState} from 'react';
export type Theme='light'|'dark';
const KEY='sdv-theme';
/** Tema atual para componentes profundos (ex.: o mapa), sem repassar props por toda a árvore. */
export const ThemeContext=createContext<Theme>('light');
export const useCurrentTheme=()=>useContext(ThemeContext);
// Preferência de aparência não é dado sensível: guardar no navegador é seguro.
function stored():Theme|null{try{const v=localStorage.getItem(KEY);return v==='light'||v==='dark'?v:null;}catch{return null;}}
export function initialTheme():Theme{return stored()??(typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}
export function applyTheme(theme:Theme){document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#0b121a':'#172938');}
export function useTheme(){
 const[theme,setTheme]=useState<Theme>(initialTheme);
 useEffect(()=>{applyTheme(theme);},[theme]);
 const toggle=useCallback(()=>setTheme(current=>{const next=current==='dark'?'light':'dark';try{localStorage.setItem(KEY,next);}catch{/* modo privado: preferência vale só nesta sessão */}return next;}),[]);
 return {theme,toggle};
}
