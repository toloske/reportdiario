
import { supabase } from "./supabaseClient";

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
        return data || [];
    },

    fetchVehiclesBySVC: async (svcId: string): Promise<Vehicle[]> => {
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .eq('svc_id', svcId)
            .eq('active', true)
            .order('plate');

        if (error) {
            console.error("Error fetching vehicles:", error);
            return [];
        }

        return (data || []).map(v => ({
            plate: v.plate,
            svc_id: v.svc_id,
            ranToday: true, // Default state for UI
            operation: v.operation,
            modal: v.modal,
            fleet_type: v.fleet_type
        }));
    },
    
    fetchFixedFleetVehicles: async (): Promise<Vehicle[]> => {
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .or('fleet_type.eq.FROTA FIXA,svc_id.eq.XPT')
            .eq('active', true);

        if (error) {
            console.error("Error fetching fixed fleet vehicles:", error);
            return [];
        }

        return data || [];
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

        const { data, error } = await supabase
            .from('daily_reports')
            .select('justifications')
            .eq('date', prevDateStr)
            .eq('svc_id', svcId)
            .order('created_at', { ascending: false });

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
    }
};
