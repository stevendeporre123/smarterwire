import { q } from '../db/client';
import { list } from '../db/repo';

export interface Project { id: string; name: string; address?: string; client?: string; owner?: string; ean?: string; supply?: string; supply_amp?: number | null; supply_cable?: string | null; earth_ohm?: number | null; earth_type?: string | null; inspector?: string; inspector_info?: string; notes?: string; updated_at: number }
export interface Board { id: string; project_id: string; name: string; kind: 'bestaand' | 'nieuw'; location?: string; asset_id?: string | null; src_board_id?: string | null; notes?: string }
export interface Device {
  id: string; board_id: string; parent_id?: string | null; kind: string; label?: string | null; poles?: string | null;
  rating_a?: number | null; curve?: string | null; sens_ma?: number | null; dtype?: string | null; breaking_ka?: number | null; phase?: string | null; trip_ma?: number | null; trip_ms?: number | null;
  row_no: number; pos: number; modules: number; rx?: number | null; ry?: number | null; rw?: number | null; rh?: number | null; notes?: string | null;
}
export interface Circuit {
  id: string; project_id: string; nr?: string | null; name: string; func?: string | null; device_id?: string | null; new_device_id?: string | null;
  voltage?: number | null; cable_type?: string | null; section_mm2?: number | null; wires?: number | null; has_earth?: number | null; insulation_mohm?: number | null; loop_ohm?: number | null; measured_at?: string | null;
  rooms?: string | null; status: string; notes?: string | null;
  fire_class?: string | null; install?: string | null; conduit?: number | null; level?: string | null; lock_group?: string | null; feeds_board_id?: string | null;
}
export interface Plan { id: string; project_id: string; name: string; level?: string | null; asset_id?: string | null; w?: number | null; h?: number | null; scale?: number | null; bg_opacity?: number | null }
export interface Shape {
  id: string; plan_id: string; kind: 'wall' | 'window' | 'door' | 'stair' | 'furniture' | 'text' | 'cable';
  x1?: number | null; y1?: number | null; x2?: number | null; y2?: number | null; ref_id?: string | null; pos?: number | null; size?: number | null; thick?: number | null;
  flip?: number | null; rot?: number | null; label?: string | null; sub?: string | null;
}
export interface Symbol_ { id: string; plan_id: string; type: string; x: number; y: number; rot: number; circuit_id?: string | null; board_id?: string | null; label?: string | null; notes?: string | null }

export const boardsOf = (pid: string) => list<Board>('board', pid);
export const devicesOf = (boardId: string) => list<Device>('device', boardId);
export const circuitsOf = (pid: string) => list<Circuit>('circuit', pid);
export const plansOf = (pid: string) => list<Plan>('plan', pid);
export const shapesOf = (planId: string) => list<Shape>('shape', planId);
export const symbolsOf = (planId: string) => list<Symbol_>('symbol', planId);
export const allDevicesOfProject = (pid: string) => q<Device>('devices', { project: pid });
