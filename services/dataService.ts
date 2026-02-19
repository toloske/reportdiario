
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
            ranToday: true // Default state for UI
        }));
    }
};
