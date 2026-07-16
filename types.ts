
export enum Step {
  OFFER_CAPACITY = 1,
  CHECKLIST_ACCEPTANCE = 2,
  LOST_DRIVERS = 3
}

export enum View {
  FORM = 'form',
  SUCCESS = 'success',
  ADMIN = 'admin'
}

export interface VehicleCategory {
  id: string;
  name: string;
  offer: number | null;
  capacity: number | null;
}

export interface VehicleStatus {
  plate: string;
  ranToday: boolean;
  justification?: string;
  otherJustification?: string;
  hiringForecast?: string;
  modal?: string;
  operation?: string;
  fleetType?: string;
  previousJustification?: string;
}

export interface LostDriver {
  id: string;
  name: string;
  modal: string;
  fleetType: 'SPOT' | 'FROTA FIXA' | 'FROTA PRÓPRIA';
  plate?: string;
  reason: string;
  fuelCard?: 'Sim' | 'Não';
}

export interface FormData {
  date: string;
  svc: string;
  categories: VehicleCategory[];
  vehicleStatuses: VehicleStatus[];
  acceptanceType: 'D-1' | 'D-7';
  attachment: File | null;
  lostDrivers: LostDriver[];
}

export interface SavedReport extends Omit<FormData, 'attachment'> {
  id: string;
  timestamp: number;
  attachmentName?: string;
}
