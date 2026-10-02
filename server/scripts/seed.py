"""Generate deterministic demo data. Existing users are preserved verbatim."""
from __future__ import annotations
import json, random, sys
from pathlib import Path
import bcrypt
ROOT=Path(__file__).resolve().parents[1]; DATA=ROOT/"data"; random.seed(2026)
USERS=[
 {"id":"u_001","username":"Santosh Kute","password_hash":"$2b$12$FMvqO7wOH9bEUeJ1BPx0b.vEXb6BcFMhRqx1Ery1L/X6k3L7XlY0S","display_name":"Santosh Kute","role":"admin","is_developer":False,"title":"Head – Motor Claims","email":"santosh.kute@abc-insurance.example","avatar":None,"customer_id":None,"preferences":{"theme":"system","sidebar_collapsed":False,"density":"comfortable"}},
 {"id":"u_002","username":"Ameya Chauhan","password_hash":"$2b$12$u.GvUtXfqcUxZpkhWX/GL.ZOC7sOD.ivr9bWXX2LN6nKSHnjSPjb6","display_name":"Ameya Chauhan","role":"admin","is_developer":True,"title":"Solution Developer","email":"ameya.chauhan@abc-insurance.example","avatar":None,"customer_id":None,"preferences":{"theme":"system","sidebar_collapsed":False,"density":"comfortable"}},
 {"id":"u_003","username":"Rahul Sharma","password_hash":"$2b$12$MVCyVTwnZhz.KTGJy7vTd.gj3WOklcy6zkX0IlbRmSpQB22LUMgVC","display_name":"Rahul Sharma","role":"customer","is_developer":False,"title":"Policyholder","email":"rahul.sharma@example.com","avatar":None,"customer_id":"c_0001","preferences":{"theme":"system","sidebar_collapsed":False,"density":"comfortable"}},]
def write(name,value): (DATA/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding="utf-8")
def seed_users():
 p=DATA/"users.json"; existing=json.loads(p.read_text(encoding="utf-8")) if p.exists() else []; by={u.get("username","").casefold():u for u in existing}
 for u in USERS: by.setdefault(u["username"].casefold(),u)
 write(Path("users.json"),list(by.values()))
def seed():
 seed_users()
 customers=[{"id":"c_0001","name":"Rahul Sharma","phone":"+91 98765 43210","email":"rahul.sharma@example.com","city":"Pune","preferred_language":"hi-en"}]
 write(Path("customers.json"),customers)
 scenarios=[("clean_rear_end","c_0001","AUTO_PREAUTH"),("fastag_mismatch","c_0042","SIU_INVESTIGATION"),("garage_overquote","c_0043","UNDER_REVIEW"),("theft_two_wheeler","c_0044","INFO_REQUESTED"),("flood_total_loss","c_0045","UNDER_REVIEW")]
 claims=[]
 statuses=["SETTLED","APPROVED","INFO_REQUESTED","SIU_INVESTIGATION","PROCESSING"]
 for i in range(1,251):
  cid=f"ABC-MC-2026-{i:06d}"; customer="c_0001" if i<=2 else f"c_{i:04d}"
  status=statuses[i%len(statuses)]; amount=18000 + (i%18)*2750
  claims.append({"id":cid,"status":status,"customer_id":customer,"customer_name":"Rahul Sharma" if customer=="c_0001" else f"Customer {i:03d}","policy_no":f"ABC/PC/2025/{i:06d}","vehicle_id":f"v_{i:04d}","registration":f"MH 12 AB {1000+i:04d}","vehicle_type":["Car","2W","CV"][i%3],"claim_type":["OD","OD","OD","Theft","Glass"][i%5],"city":["Pune","Mumbai","Thane","Nashik","Delhi"][i%5],"garage":"ABC Network Garage" if i%2 else "Partner Auto Works","risk_band":["low","low","medium","high"][i%4],"channel":["whatsapp","app","web","branch"][i%4],"amount_claimed":amount,"amount_approved":amount-1000 if status in {"SETTLED","APPROVED"} else 0,"created_at":f"2026-{(i%9)+1:02d}-15T10:00:00+05:30","updated_at":"2026-09-01T10:00:00+05:30","media":[{"id":f"m_{i}","kind":"photo","url":f"/assets/stock/{['car-front','car-rear','car-side'][i%3]}/fallback.webp","thumb":f"/assets/stock/{['car-front','car-rear','car-side'][i%3]}/fallback-thumb.webp","blur_data":f"/assets/stock/{['car-front','car-rear','car-side'][i%3]}/fallback-blur.webp"}],"incident":{},"checks":{},"damage":{},"financials":{"net_payable":amount-1000},"fraud":{}})
 for n,(scenario,customer,status) in enumerate(scenarios):
  claims[n]["scenario_id"]=scenario; claims[n]["customer_id"]=customer; claims[n]["status"]=status
 write(Path("claims.json"),claims)
 whatsapp=[{"id":s,"title":s.replace("_"," ").title(),"claim_id":claims[i]["id"],"messages":[]} for i,(s,_,__) in enumerate(scenarios)]
 notifications=[{"id":f"n_{i:03d}","user_id":"u_001","title":f"Claim update {i+1}: ABC-MC-2026-{i+1:06d}","href":f"/claims/ABC-MC-2026-{i+1:06d}","read":i>5} for i in range(20)]
 for name,val in {"policies.json":[],"vehicles.json":[],"vahan.json":{},"fastag.json":{},"iib.json":{},"driving_licences.json":{},"police_records.json":{},"garages.json":[],"cities.json":[],"parts_catalog.json":[],"labour_rates.json":{},"labour_operations.json":{},"paint_rates.json":{},"depreciation_rules.json":{},"deductibles.json":{},"fraud_rules.json":[],"document_requirements.json":{},"pipeline_runs.json":[],"notifications.json":notifications,"tickets.json":[],"support_faqs.json":[],"release_notes.json":[],"whatsapp_scenarios.json":whatsapp}.items(): write(Path(name),val)
 print(f"Seeded users={len(json.loads((DATA/'users.json').read_text()))} claims={len(claims)} customers={len(customers)}")
if __name__=="__main__": seed()
