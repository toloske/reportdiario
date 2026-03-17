import csv
import json
import os
from supabase import create_client, Client
from dotenv import load_dotenv
from sys import stdout

# Load env
load_dotenv(dotenv_path="c:/Users/Hitalo Correa/Desktop/drive/Justificativas Site/reportdiario/.env")
url: str = os.getenv("VITE_SUPABASE_URL")
key: str = os.getenv("VITE_SUPABASE_ANON_KEY")
supabase: Client = create_client(url, key)

csv_path = "c:/Users/Hitalo Correa/Desktop/drive/Justificativas Site/rotas.csv"

batch_size = 5000
batch = []
total_inserted = 0

print("Starting to parse rotas.csv...")

with open(csv_path, mode='r', encoding='utf-8') as file:
    reader = csv.DictReader(file, delimiter=';')
    for row in reader:
        
        # We need Date, Route_ID, Plate, Driver_ID, etc.
        raw_date = row.get('Data', '')
        route_id = row.get('Route_ID', '')
        plate = row.get('Placa', '')
        driver_id = row.get('Driver_ID', '')
        vehicle_type = row.get('Veículo', '')
        
        if not route_id or not plate or not raw_date:
            continue
            
        # Format date from DD/MM/YYYY to YYYY-MM-DD
        try:
            d, m, y = raw_date.split('/')
            formatted_date = f"{y}-{m}-{d}"
        except:
            continue

        cleaned_plate = ''.join(c for c in plate if c.isalnum()).upper()
        if len(cleaned_plate) < 5:
            continue

        record = {
            "route_id": route_id,
            "date": formatted_date,
            "plate": cleaned_plate,
            "driver_id": driver_id,
            "vehicle_type": vehicle_type
        }
        
        batch.append(record)
        
        if len(batch) >= batch_size:
            try:
                # Upsert to ignore duplicates
                supabase.table('daily_routes').upsert(batch, on_conflict='route_id', ignore_duplicates=True).execute()
                total_inserted += len(batch)
                stdout.write(f"\rImported {total_inserted} records so far...")
                stdout.flush()
            except Exception as e:
                print(f"\nError inserting batch: {e}")
            batch = []

# Insert remainder
if len(batch) > 0:
    try:
        supabase.table('daily_routes').upsert(batch, on_conflict='route_id', ignore_duplicates=True).execute()
        total_inserted += len(batch)
    except Exception as e:
        print(f"\nError inserting final batch: {e}")

print(f"\n\nDone! Successfully imported {total_inserted} total route records from history.")
