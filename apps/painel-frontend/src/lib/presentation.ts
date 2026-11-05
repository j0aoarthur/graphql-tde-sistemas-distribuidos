export const PRIORITIES=[
 {value:1,label:'Baixa',color:'#28765a',background:'#e7f4ed'},
 {value:2,label:'Moderada',color:'#245eaa',background:'#eaf1fc'},
 {value:3,label:'Alta',color:'#8b5a08',background:'#fff3d6'},
 {value:4,label:'Urgente',color:'#a34111',background:'#fff0e5'},
 {value:5,label:'Crítica',color:'#b42332',background:'#fdebed'},
];
export function formatDuration(seconds?:number|null){if(seconds==null||!Number.isFinite(seconds))return 'Indisponível';const s=Math.max(0,Math.round(seconds));return `${Math.floor(s/60)} min ${String(s%60).padStart(2,'0')} s`;}
