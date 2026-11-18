export type Coordenada = { latitude: number; longitude: number };
export type ViaturaCandidata = Coordenada & { id: string; status: string };
export function haversineKm(a: Coordenada, b: Coordenada): number;
export function rankViaturas<T extends ViaturaCandidata>(candidates: T[], destination: Coordenada): Array<T & {distanceKm: number}>;
