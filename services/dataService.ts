
import { supabase } from "./supabaseClient";
import decommissionedVehicles from "../decommissioned_vehicles.json";

export interface SVC {
    id: string;
    name: string;
    manager: string;
    city: string;
}

export interface Vehicle {
    plate: string;
    svc_id: string;
    ranToday: boolean;
    justification?: string;
    otherJustification?: string;
    operation?: string;
    modal?: string;
    fleet_type?: string;
}

export const isVehicleActiveOnDate = (plate: string, dateStr?: string): boolean => {
    if (!plate || !dateStr) return true;
    const cleanPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const deactDate = (decommissionedVehicles as Record<string, string>)[cleanPlate];
    if (deactDate) {
        return dateStr < deactDate;
    }
    return true;
};

export const dataService = {
    fetchSVCs: async (): Promise<SVC[]> => {
        const { data, error } = await supabase
            .from('service_centers')
            .select('*')
            .order('name');

        if (error) {
            console.error("Error fetching SVCs:", error);
            return [];
        }
        const filtered = (data || []).filter(svc => svc.id !== 'SSP49' && svc.id !== 'SSP57' && svc.id !== 'SSP18');
        return filtered.map(svc => {
            if (svc.id === 'SSP40') {
                return {
                    ...svc,
                    name: 'SSP40 / SSP49 / SSP57',
                    city: 'Zona Norte'
                };
            }
            return svc;
        });
    },

    fetchVehiclesBySVC: async (svcId: string, dateStr?: string): Promise<Vehicle[]> => {
        let query = supabase
            .from('vehicles')
            .select('*')
            .eq('active', true)
            .order('plate');

        if (svcId === 'SSP40') {
            query = query.in('svc_id', ['SSP40', 'SSP49', 'SSP57']);
        } else {
            query = query.eq('svc_id', svcId);
        }

        const { data, error } = await query;

        if (error) {
            console.error("Error fetching vehicles:", error);
            return [];
        }

        const mapped = (data || []).map(v => ({
            plate: v.plate,
            svc_id: v.svc_id,
            ranToday: true, // Default state for UI
            operation: v.operation,
            modal: v.modal,
            fleet_type: v.fleet_type
        }));

        if (dateStr) {
            return mapped.filter(v => isVehicleActiveOnDate(v.plate, dateStr));
        }
        return mapped;
    },
    
    fetchFixedFleetVehicles: async (dateStr?: string): Promise<Vehicle[]> => {
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .or('fleet_type.eq.FROTA FIXA,svc_id.eq.XPT')
            .eq('active', true);

        if (error) {
            console.error("Error fetching fixed fleet vehicles:", error);
            return [];
        }

        const mapped = (data || []).map(v => {
            if (v.svc_id === 'SSP49' || v.svc_id === 'SSP57') {
                return { ...v, svc_id: 'SSP40' };
            }
            return v;
        });

        if (dateStr) {
            return mapped.filter(v => isVehicleActiveOnDate(v.plate, dateStr));
        }
        return mapped;
    },

    fetchPreviousJustifications: async (dateStr: string, svcId: string): Promise<Record<string, string>> => {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return {};
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        
        const d = new Date(year, month, day);
        d.setDate(d.getDate() - 1);
        
        const prevYear = d.getFullYear();
        const prevMonth = String(d.getMonth() + 1).padStart(2, '0');
        const prevDay = String(d.getDate()).padStart(2, '0');
        const prevDateStr = `${prevYear}-${prevMonth}-${prevDay}`;

        let query = supabase
            .from('daily_reports')
            .select('justifications')
            .eq('date', prevDateStr)
            .order('created_at', { ascending: false });

        if (svcId === 'SSP40') {
            query = query.in('svc_id', ['SSP40', 'SSP49', 'SSP57']);
        } else {
            query = query.eq('svc_id', svcId);
        }

        const { data, error } = await query;

        if (error || !data || data.length === 0) {
            return {};
        }

        const mapping: Record<string, string> = {};
        data.forEach(report => {
            const justificationsStr = report.justifications || '';
            justificationsStr.split(';').forEach((item: string) => {
                const partsJust = item.split(' - ');
                if (partsJust.length >= 2) {
                    const plateRaw = partsJust[0].trim();
                    const plate = plateRaw.replace(/"/g, '').trim();
                    const justification = partsJust.slice(1).join(' - ').trim();
                    if (plate && !mapping[plate]) {
                        mapping[plate] = justification;
                    }
                }
            });
        });

        return mapping;
    },

    fetchRoutedPlatesByDate: async (dateStr: string): Promise<string[]> => {
        const { data, error } = await supabase
            .from('daily_routes')
            .select('plate')
            .eq('date', dateStr);

        if (error) {
            console.error("Error fetching routed plates:", error);
            return [];
        }
        return (data || []).map(r => r.plate);
    }
};
