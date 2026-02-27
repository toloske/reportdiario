
import { VehicleCategory } from './types';

export const INITIAL_CATEGORIES: VehicleCategory[] = [
  { id: 'bulk_vuc_pool', name: 'BULK - VUC EQUIPE ÚNICA POOL', offer: null, capacity: null },
  { id: 'utilitarios', name: 'UTILITÁRIOS', offer: null, capacity: null },
  { id: 'bulk_van_pool', name: 'BULK - VAN EQUIPE ÚNICA POOL', offer: null, capacity: null },
  { id: 'van', name: 'VAN', offer: null, capacity: null },
  { id: 'veiculo_passeio', name: 'VEÍCULO DE PASSEIO', offer: null, capacity: null },
  { id: 'vuc', name: 'VUC', offer: null, capacity: null },
];

export const JUSTIFICATION_OPTIONS = [
  'Falta',
  'Manutenção',
  'Folga',
  'Sem Driver',
  'Carro reserva'
];

export const SVC_OPTIONS = [
  { id: 'svc01', name: 'SVC - Fallback 1' }
];
