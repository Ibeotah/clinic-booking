# security.py

#This function runs before every request. It reads the X-API-Key header and compares it with the key in .env.
#Header X-API-Key: koya-clinic-2026 → request continues.
#No header, or X-API-Key: wrong → 401.

import os
from dotenv import load_dotenv
from fastapi import Header, HTTPException

load_dotenv()
API_KEY = os.getenv("API_KEY")

if not API_KEY:
    raise ValueError("Please set API_KEY in your .env file.")


def verify_api_key(x_api_key: str | None = Header(default=None)):
    # FastAPI reads the header "X-API-Key" from the parameter "x_api_key"
    if not x_api_key or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")