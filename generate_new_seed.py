
import csv
import json
import os

# Files
svc_file = 'Regionais  - Regionais.csv'
vehicles_file = '../Placas SVC - Página1.csv'

# Read SVCs
svcs = []
with open(svc_file, mode='r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        svcs.append({
            'id': row['SVC'],
            'name': row['SVC'], # Use ID as name for now, or format it
            'manager': row['Gestor'],
            'city': row['Cidade']
        })

# Read Vehicles
vehicles = []
with open(vehicles_file, mode='r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        svc_val = row['Base'].strip().upper()
        plate_val = row['Placa'].strip().upper()
        
        # Ensure svc_val exists in svcs
        if not any(s['id'] == svc_val for s in svcs):
            svcs.append({'id': svc_val, 'name': svc_val, 'manager': '', 'city': ''})
            
        vehicles.append({
            'plate': plate_val,
            'svc_id': svc_val,
            'active': True
        })

# Generate SQL
sql_statements = []

# Truncate tables (cascade to remove related vehicles)
sql_statements.append("TRUNCATE TABLE public.vehicles CASCADE;")
sql_statements.append("TRUNCATE TABLE public.service_centers CASCADE;")

# Insert SVCs
if svcs:
    values = []
    for s in svcs:
        safe_id = str(s['id']).strip().upper().replace("'", "''")
        safe_name = str(s['name']).strip().upper().replace("'", "''")
        safe_manager = str(s['manager']).replace("'", "''")
        safe_city = str(s['city']).replace("'", "''")
        values.append(f"('{safe_id}', '{safe_name}', '{safe_manager}', '{safe_city}')")
    
    sql_statements.append(f"INSERT INTO public.service_centers (id, name, manager, city) VALUES {','.join(values)};")

# Insert Vehicles
if vehicles:
    values = []
    for v in vehicles:
        safe_plate = str(v['plate']).strip().upper().replace("'", "''")
        safe_svc = str(v['svc_id']).strip().upper().replace("'", "''")
        values.append(f"('{safe_plate}', '{safe_svc}', true)")
    
    sql_statements.append(f"INSERT INTO public.vehicles (plate, svc_id, active) VALUES {','.join(values)};")

# Output to file
with open('seed_new_data.sql', 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_statements))

print("SQL generated: seed_new_data.sql")
