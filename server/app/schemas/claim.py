from pydantic import BaseModel
class Claim(BaseModel):
    id: str
    status: str
    customer_id: str
    policy_no: str
    vehicle_id: str
    claim_type: str = "OD"
    created_at: str
    updated_at: str
    incident: dict = {}
    checks: dict = {}
    damage: dict = {}
    financials: dict = {}
    fraud: dict = {}
