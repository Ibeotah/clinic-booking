# main.py
import hashlib
import json
import math
import re
from datetime import datetime, timedelta, timezone
import uuid

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError
import uvicorn

from database import supabase
from security import verify_api_key
from schemas import BookingIn, ResetRequest, SlotListOut, SlotOut, format_provider

ZERO_UUID = "00000000-0000-0000-0000-000000000000"

app = FastAPI(
    title="Clinic booking API",
    description=(
        "API for managing clinic appointment slots, booking and canceling "
        "patient reservations, with role-based access control, idempotency, "
        "and rate limiting."
    ),
    version="1.0",
    dependencies=[Depends(verify_api_key)],  # every request needs the key
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "Idempotency-Key"],
    expose_headers=["Retry-After"],
)


# Makes every error look like {"error": "<message>"}
# Some code raises an error on purpose. For example, in security.py:
# raise HTTPException(status_code=401, detail="Invalid or missing API key")
#The line @app.exception_handler(HTTPException) tells FastAPI: "When an HTTPException happens, run this function."
# The handler builds the response.
#exc is the error object that was raised.
#exc.status_code is 401.
#exc.detail is "Invalid or missing API key"
#The handler sends back:
#HTTP 401
#{"error": "Invalid or missing API key"}
@app.exception_handler(HTTPException)
async def http_error_handler(_request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail},
        headers=exc.headers,
    )

# first_error_message turns FastAPI's error details into one short sentence.
def first_error_message(exc: RequestValidationError) -> str:
    # Use the first problem only, for example:
    # "slots.0.provider: provider must not be empty"
    problem = exc.errors()[0]
    field = ".".join(str(part) for part in problem["loc"] if part != "body")
    message = problem["msg"].removeprefix("Value error, ")
    return f"{field}: {message}" if field else message

# This catches bad input data to any endpoint and returns an object with error property...
@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": first_error_message(exc)},
    )
@app.get("/")
def read_root():
    return {"status": "healthy", "message": "Clinic Booking API is running"}


# POST /reset: Level 1
@app.post("/reset")
def reset_slots(body: ResetRequest):
    # 1. Delete child rows first (bookings depend on slots)
    supabase.table("bookings").delete().neq("id", ZERO_UUID).execute()
    supabase.table("idempotency_keys").delete().neq("key", "").execute()
    supabase.table("rate_limits").delete().neq("id", ZERO_UUID).execute()

    # 2. Delete all old slots
    supabase.table("slots").delete().neq("id", "").execute()

    # 3. Insert the new slots (API "start"/"end" -> DB "start_time"/"end_time")
    rows = [
        {
            "id": slot.id,
            "provider": slot.provider,
            "start_time": slot.start.isoformat(),
            "end_time": slot.end.isoformat(),
            "available": True,
        }
        for slot in body.slots
    ]
    if rows:
        supabase.table("slots").insert(rows).execute()

    return {"message": "Done", "slots_created": len(rows)}


# GET /slots: Level 1
@app.get("/slots", response_model=SlotListOut)
def list_slots(provider: str | None = None):
    query = supabase.table("slots").select("*")

    if provider is not None:
        query = query.eq("provider", format_provider(provider))  # exact match

    result = query.order("start_time").execute()  # earliest first

    slots = [
        SlotOut(
            id=row["id"],
            provider=row["provider"],
            start=row["start_time"],
            end=row["end_time"],
            available=row["available"],
        )
        for row in result.data
    ]
    return {"slots": slots}

# POST /bookings: Levels 1 to 5
@app.post("/bookings", status_code=201)
def create_booking(
    body: BookingIn,
    idempotency_key: str | None = Header(default=None),
):
    # 1. Clean the data: remove spaces, lowercase the email
    slot_id = (body.slot_id or "").strip()
    name = (body.name or "").strip()
    email = (body.email or "").strip().lower()
    data = {"slot_id": slot_id, "name": name, "email": email}
    request_hash = make_request_hash(data)

    # 2. Level 4: check the Idempotency-Key
    if idempotency_key:
        saved = (
            supabase.table("idempotency_keys")
            .select("*")
            .eq("key", idempotency_key)
            .execute()
            .data
        )
        if saved:
            # Same key, different data -> 422
            if saved[0]["request_hash"] != request_hash:
                raise HTTPException(
                    status_code=422,
                    detail="Idempotency-Key was already used with a different request",
                )
            # Same key, same data -> send the first answer again
            return JSONResponse(
                status_code=saved[0]["response_code"],
                content=saved[0]["response_body"],
            )

    # 3. Level 2: email must be present and valid
    if not email or not EMAIL_PATTERN.match(email):
        raise HTTPException(status_code=400, detail="email is missing or not valid")

    # 4. Level 5: count this attempt
    check_rate_limit(email)

    # 5. Level 2: slot_id and name must be present
    if not slot_id or not name:
        raise HTTPException(status_code=400, detail="slot_id and name are required")

    # 6. Level 2: the slot must exist
    slot_result = supabase.table("slots").select("*").eq("id", slot_id).execute()
    if not slot_result.data:
        raise HTTPException(status_code=404, detail="slot not found")
    slot = slot_result.data[0]

    # 7. Level 2: the slot must not have started yet
    start = datetime.fromisoformat(slot["start_time"])
    if start <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="slot has already started")

    # 8. Level 3: the slot must not have a confirmed booking
    existing = (
        supabase.table("bookings")
        .select("id")
        .eq("slot_id", slot_id)
        .eq("status", "confirmed")
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="slot already booked")

    # 9. Save the booking. The database blocks a second confirmed booking.
    try:
        result = (
            supabase.table("bookings")
            .insert({"slot_id": slot_id, "name": name, "email": email})
            .execute()
        )
    except APIError as error:
        if error.code == "23505":  # unique index violation
            raise HTTPException(status_code=409, detail="slot already booked")
        raise

    booking = result.data[0]

    # 10. Mark the slot as taken
    supabase.table("slots").update({"available": False}).eq("id", slot_id).execute()

    response_body = {
        "id": str(booking["id"]),
        "slot_id": booking["slot_id"],
        "name": booking["name"],
        "email": booking["email"],
        "status": booking["status"],
        "created_at": booking["created_at"],
    }

    # 11. Save the answer under the Idempotency-Key for later retries
    if idempotency_key:
        supabase.table("idempotency_keys").insert({
            "key": idempotency_key,
            "request_hash": request_hash,
            "response_code": 201,
            "response_body": response_body,
        }).execute()

    return response_body
# GET /bookings: Level 4 (list a person's bookings, in pages)
@app.get("/bookings")
def list_bookings(
    email: str | None = None,
    limit: str = "10",
    cursor: str | None = None,
):
    # 1. Email is required. Upper or lower case does not matter.
    clean_email = (email or "").strip().lower()
    if not clean_email:
        raise HTTPException(status_code=400, detail="email is required")

    # 2. Limit must be a whole number from 1 to 50
    try:
        page_size = int(limit)
    except ValueError:
        page_size = 0
    if not 1 <= page_size <= 50:
        raise HTTPException(status_code=400, detail="limit must be from 1 to 50")

    # 3. Get all this person's bookings, oldest first
    rows = (
        supabase.table("bookings")
        .select("*")
        .eq("email", clean_email)
        .order("created_at")
        .order("id")
        .execute()
        .data
    )

    # 4. Find where to start. No cursor means the start of the list.
    start_index = 0
    if cursor:
        ids = [str(row["id"]) for row in rows]
        if cursor not in ids:
            raise HTTPException(status_code=400, detail="cursor is not valid")
        start_index = ids.index(cursor) + 1  # start right after the cursor

    # 5. Cut out one page
    page = rows[start_index : start_index + page_size]

    # 6. If more rows remain, the last id of this page is the next cursor
    has_more = start_index + page_size < len(rows)
    next_cursor = str(page[-1]["id"]) if has_more else None

    return {
        "bookings": [booking_out(row) for row in page],
        "next_cursor": next_cursor,
    }

# GET /bookings/{id}: Level 1
@app.get("/bookings/{booking_id}")
def get_booking(booking_id: str):
    return booking_out(find_booking(booking_id))

# DELETE /bookings/{id}: Level 3 (cancel a booking)
@app.delete("/bookings/{booking_id}")
def cancel_booking(booking_id: str):
    booking = find_booking(booking_id)  # 404 if missing

    # 1. Cancelled bookings cannot be cancelled again
    if booking["status"] == "cancelled":
        raise HTTPException(status_code=409, detail="booking already cancelled")

    # 2. Change the status. The row stays in the table (soft delete).
    result = (
        supabase.table("bookings")
        .update({"status": "cancelled"})
        .eq("id", booking_id)
        .execute()
    )

    # 3. Free the slot so another patient can book it
    supabase.table("slots").update({"available": True}).eq("id", booking["slot_id"]).execute()

    return booking_out(result.data[0])

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")  # example: a@b.com
RATE_LIMIT_MAX = 5       # attempts allowed
RATE_LIMIT_WINDOW = 60   # seconds

# this sorts the keys in the payload object that is sent for booking a slot ie {
#   "slot_id": "s1",
#   "name": "Ada Obi",
#   "email": "ada@example.com"
# } in alphabertical order and converts the object into a one single text string ie '{"email": "ada@example.com", "name": "Ada Obi", "slot_id": "s1"}' and that entire text string is then fed into the SHA-256 function to create your unique digital fingerprint ie generating a unique 64-character hexadecimal fingerprint eg 8f4b2c9...
# Why This Matters:If Jane accidentally clicks the "Book Appointment" button twice in a split second, her browser sends two identical requests. Because both requests produce the exact same hash code, your backend can check your database, see that this exact fingerprint was processed a second ago, and block the duplicate request. This prevents double-booking errors.
def make_request_hash(data: dict) -> str:
    # Same data gives the same code. Changed data gives a different code.
    text = json.dumps(data, sort_keys=True)
    return hashlib.sha256(text.encode()).hexdigest()
# aim is to prevent a user from booking a slot more than 5 times within any rolling 60-second window. a maximum of 5 attempts per email address
def check_rate_limit(email: str) -> None:
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(seconds=RATE_LIMIT_WINDOW)

    # 1. Write this attempt in the log
    supabase.table("rate_limits").insert({"email": email}).execute()

    # 2. Count this email's attempts in the last 60 seconds (oldest first)
    result = (
        supabase.table("rate_limits")
        .select("attempted_at")
        .eq("email", email)
        .gte("attempted_at", window_start.isoformat())
        .order("attempted_at")
        .execute()
    )
    attempts = result.data

    # 3. Allowed if 5 or fewer
    if len(attempts) <= RATE_LIMIT_MAX:
        return

    # 4. Blocked. Wait until the oldest attempt is 60 seconds old.
    oldest = datetime.fromisoformat(attempts[0]["attempted_at"])
    wait = math.ceil((oldest + timedelta(seconds=RATE_LIMIT_WINDOW) - now).total_seconds())
    raise HTTPException(
        status_code=429,
        detail="Too many booking attempts. Try again later.",
        headers={"Retry-After": str(max(wait, 1))},
    )
def booking_out(row: dict) -> dict:
    # Picks the fields the spec wants, and turns the id into text
    return {
        "id": str(row["id"]),
        "slot_id": row["slot_id"],
        "name": row["name"],
        "email": row["email"],
        "status": row["status"],
        "created_at": row["created_at"],
    }


def find_booking(booking_id: str) -> dict:
    # A text that is not a valid id cannot match any booking
    try:
        uuid.UUID(booking_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="booking not found")

    result = supabase.table("bookings").select("*").eq("id", booking_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="booking not found")
    return result.data[0]


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)