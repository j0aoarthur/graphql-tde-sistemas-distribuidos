import {formatPlate} from '@sdv/shared/plate';
import type {Vehicle} from '../types';
export {formatPlate,isValidPlate,maskPlate,normalizePlate,plateKind} from '@sdv/shared/plate';
/** Número de referência operacional exibido ao operador (VTR-014). O UUID nunca é mostrado. */
export const vehicleRef=(v?:Pick<Vehicle,'codigo'>|null)=>v?.codigo!=null?`VTR-${String(v.codigo).padStart(3,'0')}`:'VTR';
export const vehiclePlate=(v?:Pick<Vehicle,'placa'>|null)=>v?.placa?formatPlate(v.placa):'';
export function vehicleSearchText(v:Vehicle){return `${vehicleRef(v)} ${vehiclePlate(v)} ${v.placa}`.toLowerCase();}
export const vehicleActivity=(status:string)=>status==='DISPONIVEL'?'Em patrulha':status==='NO_LOCAL'?'No local':status==='INDISPONIVEL'?'Reservada (demonstração)':'Em deslocamento';
