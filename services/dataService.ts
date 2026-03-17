
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
            .eq('fleet_type', 'FROTA FIXA')
            .eq('active', true);

        if (error) {
            console.error("Error fetching fixed fleet vehicles:", error);
            return [];
        }

        return data || [];
    }
};
