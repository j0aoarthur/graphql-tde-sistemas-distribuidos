export {formatDuration} from './time';
// Cores de prioridade vêm do CSS (`.priority[data-level]`), para funcionarem nos temas claro e escuro.
export const PRIORITIES=[
 {value:1,label:'Baixa'},
 {value:2,label:'Moderada'},
 {value:3,label:'Alta'},
 {value:4,label:'Urgente'},
 {value:5,label:'Crítica'},
];
// Cor do pin no mapa por prioridade (saturadas o bastante para ler sobre mapa claro e escuro).
export const PRIORITY_PIN=['#28765a','#245eaa','#8b5a08','#a34111','#b42332'];
