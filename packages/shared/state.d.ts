export function reconcileList<T extends {id:string;versao?:number;ultimoSinalEm?:string|null;atualizadoEm?:string}>(current:T[],incoming:T[]):T[];
