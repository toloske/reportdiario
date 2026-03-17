
import { supabase } from "./supabaseClient";
import { FormData, SavedReport } from "../types";

const BUCKET_NAME = 'comprovantes';

export const uploadAttachment = async (file: File): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${fileName}`;

    /* 
    NOTE: In a real production app without RLS, we'd need a signed URL or authenticated upload.
    For this "No Auth" requirement, we assume the bucket is PUBLIC and allows Anon inserts via Policy.
    */
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file);

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      // For now, return null but don't crash whole submission
      return null;
    }

    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    return data.publicUrl;
  } catch (error) {
    console.error('Upload failed:', error);
    return null;
  }
};

export const saveReport = async (data: FormData): Promise<SavedReport | null> => {
  let attachmentUrl = null;

  if (data.attachment) {
    attachmentUrl = await uploadAttachment(data.attachment);
  }

  // Flatten categories
  const categoryData: Record<string, number> = {};
  data.categories.forEach(cat => {
    // Standardize key names based on constants.tsx IDs
    // The table columns assume these keys exist:
    // offer_bulk_vuc_pool, capacity_bulk_vuc_pool, etc.
    const key = cat.id.replace(/-/g, '_');
    categoryData[`offer_${key}`] = cat.offer;
    categoryData[`capacity_${key}`] = cat.capacity;
  });

  // Format Justifications: ALL VEHICLES
  // "PLATE" - RODOU; "PLATE" - JUSTIFICATIVA (OUTROS)
  const justificationList = data.vehicleStatuses.map(v => {
    if (v.ranToday) {
      return `"${v.plate}" - RODOU`;
    } else {
      let just = `"${v.plate}" - ${v.justification}`;
      if (v.justification === 'Carro reserva' && v.otherJustification) {
        just += ` (${v.otherJustification})`;
      }
      return just;
    }
  });

  const justificationsStr = justificationList.join('; ');

  const dbPayload = {
    date: data.date,
    svc_id: data.svc,
    acceptance_type: data.acceptanceType,
    ...categoryData,
    justifications: justificationsStr,
    attachment_url: attachmentUrl
  };

  const { data: insertedData, error } = await supabase
    .from('daily_reports')
    .insert([dbPayload])
    .select()
    .single();

  if (error) {
    console.error('Error inserting report:', error);
    throw error;
  }

  return {
    id: insertedData.id,
    timestamp: new Date(insertedData.created_at).getTime(),
    ...data,
    attachmentName: data.attachment?.name
  };
};

export const getReportsByDate = async (dateStr: string) => {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('date', dateStr)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching reports:', error);
    return [];
  }
  return data || [];
};

export const getReportsByDateRange = async (startDate: string, endDate: string) => {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching reports by range:', error);
    return [];
  }
  return data || [];
};

export const saveDailyRoutes = async (payload: { route_id: string, date: string, plate: string, driver_id?: string, vehicle_type?: string }[]) => {
  // We use upsert on route_id constraint to ignore duplicates safely
  const { error } = await supabase
    .from('daily_routes')
    .upsert(payload, { onConflict: 'route_id', ignoreDuplicates: true });

  if (error) {
    console.error('Error saving daily routes:', error);
    throw error;
  }
};

export const getDailyRoutesByDate = async (dateStr: string) => {
  const { data, error } = await supabase
    .from('daily_routes')
    .select('*')
    .eq('date', dateStr)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching daily routes:', error);
    return [];
  }
  return data || [];
};

export const exportToCSV = () => { };
