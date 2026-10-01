"""Deterministic async stand-ins for external DPI systems."""
import asyncio, hashlib, random
from ..services.json_store import read_json
async def _lookup(file, key, default=None, delay=(.01,.02)):
    await asyncio.sleep(random.uniform(*delay)); data=await read_json(file,{})
    return data.get(key, default) if isinstance(data,dict) else default
async def vahan(registration): return await _lookup("vahan.json",registration,{"registration":registration,"blacklisted":False,"stolen":False,"rc_status":"active"})
async def fastag(registration): return await _lookup("fastag.json",registration,[])
async def iib(registration_or_customer): return await _lookup("iib.json",registration_or_customer,[])
async def driving_licence(number): return await _lookup("driving_licences.json",number,{"status":"valid"})
async def police(registration): return await _lookup("police_records.json",registration,[])
async def policy(policy_no): return await _lookup("policies.json",policy_no,{"status":"active"})
