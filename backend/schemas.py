# Schemas describe what the request and response JSON must look like. ie shape of the data
#  In suffix in Slot like SlotIn is for post/reset while out suffix is for get/slots request
# schemas.py
from datetime import datetime
from pydantic import BaseModel, field_validator


def format_provider(name: str) -> str:
    # "  dr   ade " -> "dr ade" -> "Dr Ade"
    return " ".join(name.split()).title()


class SlotIn(BaseModel):
    id: str
    provider: str
    start: datetime
    end: datetime

    @field_validator("provider")
    @classmethod
    def clean_provider(cls, value: str) -> str:
        cleaned = format_provider(value)
        if not cleaned:
            raise ValueError("provider must not be empty")
        return cleaned


class ResetRequest(BaseModel):
    slots: list[SlotIn]


class SlotOut(BaseModel):
    id: str
    provider: str
    start: datetime
    end: datetime
    available: bool


class SlotListOut(BaseModel):
    slots: list[SlotOut]

class BookingIn(BaseModel):
    slot_id: str | None = None
    name: str | None = None
    email: str | None = None