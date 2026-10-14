import { sql } from '../db/client';
import { list } from '../db/repo';

export interface Project { id: string; name: string; address?: string; client?: string; owner?: string; ean?: string; supply?: string; supply_amp?: number | null; inspector?: string; inspector_info?: string; notes?: string; updated_at: number }
export interface Board { id: string; project_id: string; name: string; kind: 'bestaand' | 'nieuw'; location?: string; asset_id?: string | null; src_board_id?: string | null; notes?: string }
export interface Device {
  id: string; board_id: string; parent_id?: string | null; kind: string; label?: string | null; poles?: string | null;
  rating_a?: number | null; curve?: string | null; sens_ma?: number | null; dtype?: string | null; breaking_ka?: number | null; phase?: string | null;
  row_no: number; pos: number; modules: number; rx?: number | null; ry?: number | null; rw?: number | null; rh?: number | null; notes?: string | null;
}
export interface Circuit {
  id: string; project_id: string; nr?: string | null; name: string; func?: string | null; device_id?: string | null; new_device_id?: string | null;
  voltage?: number | null; cable_type?: string | null; section_mm2?: number | null; wires?: number | null; has_earth?: number | null;
  rooms?: string | null; status: string; notes?: string | null;
  fire_class?: string | null; install?: string | null; level?: string | null; lock_group?: string | null; feeds_board_id?: string | null;
}
export interface Plan { id: string; project_id: string; name: string; level?: string | null; asset_id?: string | null; w?: number | null; h?: number | null; scale?: number | null; bg_opacity?: number | null }
export interface Shape {
  id: string; plan_id: string; kind: 'wall' | 'window' | 'door' | 'stair' | 'furniture' | 'text' | 'cable';
  x1?: number | null; y1?: number | null; x2?: number | null; y2?: number | null; ref_id?: string | null; pos?: number | null; size?: number | null; thick?: number | null;
  flip?: number | null; rot?: number | null; label?: string | null; sub?: string | null;
}
export interface Symbol_ { id: string; plan_id: string; type: string; x: number; y: number; rot: number; circuit_id?: string | null; board_id?: string | null; label?: string | null; notes?: string | null }

export const boardsOf = (pid: string) => list<Board>('board', 'project_id=?', [pid], 'kind, name');
export const devicesOf = (boardId: string) => list<Device>('device', 'board_id=?', [boardId], 'row_no, pos');
export const circuitsOf = (pid: string) =>
  list<Circuit>('circuit', 'project_id=?', [pid], `CASE WHEN nr GLOB '[0-9]*' THEN CAST(nr AS INTEGER) ELSE 9999 END, nr, name`);
export const plansOf = (pid: string) => list<Plan>('plan', 'project_id=?', [pid], 'level, name');
export const shapesOf = (planId: string) => list<Shape>('shape', 'plan_id=?', [planId]);
export const symbolsOf = (planId: string) => list<Symbol_>('symbol', 'plan_id=?', [planId]);
export const allDevicesOfProject = (pid: string) =>
  sql.query<Device>(`SELECT d.* FROM device d JOIN board b ON b.id=d.board_id WHERE d.deleted=0 AND b.deleted=0 AND b.project_id=?`, [pid]);
