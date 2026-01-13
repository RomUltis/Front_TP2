import os
import time
import serial
import requests
from dotenv import load_dotenv
from typing import Optional, Dict, Any

load_dotenv()

SERIAL_PORT = os.getenv("SERIAL_PORT", "COM3")
BAUDRATE = int(os.getenv("BAUDRATE", "9600"))

API_BASE = os.getenv("API_BASE", "http://172.29.19.20:33003").rstrip("/")
LOGIN_URL = f"{API_BASE}/login"
GPS_URL = f"{API_BASE}/gps"

APP_USER = os.getenv("APP_USER", "")
APP_PASS = os.getenv("APP_PASS", "")
DEFAULT_BOAT = os.getenv("DEFAULT_BOAT", "Endurance")

SESSION = requests.Session()
TOKEN: Optional[str] = None


def headers() -> Dict[str, str]:
    h = {"Content-Type": "application/json"}
    if TOKEN:
        h["Authorization"] = f"Bearer {TOKEN}"
    return h


def login() -> bool:
    global TOKEN
    if not APP_USER or not APP_PASS:
        print("APP_USER / APP_PASS manquants dans le .env")
        return False

    try:
        r = SESSION.post(LOGIN_URL, json={"username": APP_USER, "password": APP_PASS}, timeout=8)
        data = r.json()
        if not r.ok or not data.get("success"):
            print(f"Login refusé ({r.status_code}): {data}")
            return False

        TOKEN = data.get("token")
        if not TOKEN:
            print("Login OK mais token absent.")
            return False

        print("Login OK (token récupéré)")
        return True
    except Exception as e:
        print(f"Erreur login: {e}")
        return False


def nmea_to_decimal(coord: str, hemi: str) -> Optional[float]:
    if not coord or not hemi:
        return None
    hemi = hemi.strip().upper()
    deg_len = 2 if hemi in ("N", "S") else 3
    try:
        deg = float(coord[:deg_len])
        minutes = float(coord[deg_len:])
        dec = deg + (minutes / 60.0)
        if hemi in ("S", "W"):
            dec = -dec
        return dec
    except:
        return None


def parse_nmea_raw(raw: str) -> Optional[Dict[str, Any]]:
    s = raw.strip()

    if s.startswith("$GPGGA") or s.startswith("$GNGGA"):
        f = s.split(",")
        if len(f) < 6:
            return None
        lat = nmea_to_decimal(f[2], f[3])
        lon = nmea_to_decimal(f[4], f[5])
        if lat is None or lon is None:
            return None
        return {"latitude": lat, "longitude": lon}

    if s.startswith("$GPRMC") or s.startswith("$GNRMC"):
        f = s.split(",")
        if len(f) < 7:
            return None
        status = f[2].strip().upper() if len(f) > 2 else ""
        if status and status != "A":
            return None
        lat = nmea_to_decimal(f[3], f[4])
        lon = nmea_to_decimal(f[5], f[6])
        if lat is None or lon is None:
            return None
        return {"latitude": lat, "longitude": lon}

    return None


def parse_kv_line(line: str) -> Optional[Dict[str, Any]]:
    parts = line.strip().split(";")
    data = {}
    for p in parts:
        if "=" in p:
            k, v = p.split("=", 1)
            data[k.strip().upper()] = v.strip()

    boat = data.get("BOAT", DEFAULT_BOAT)
    raw = data.get("RAW", "")

    if "LAT" in data and "LON" in data:
        try:
            return {
                "boat_name": boat,
                "latitude": float(data["LAT"]),
                "longitude": float(data["LON"]),
                "raw_frame": raw or line.strip()
            }
        except:
            return None

    if raw.startswith("$"):
        pos = parse_nmea_raw(raw)
        if pos:
            return {
                "boat_name": boat,
                "latitude": pos["latitude"],
                "longitude": pos["longitude"],
                "raw_frame": raw
            }

    return None


def parse_any(line: str) -> Optional[Dict[str, Any]]:
    line = line.strip()

    if "BOAT=" in line.upper() or "RAW=" in line.upper() or "LAT=" in line.upper():
        p = parse_kv_line(line)
        if p:
            return p

    if line.startswith("$"):
        pos = parse_nmea_raw(line)
        if pos:
            return {
                "boat_name": DEFAULT_BOAT,
                "latitude": pos["latitude"],
                "longitude": pos["longitude"],
                "raw_frame": line
            }

    return None


def post_gps(payload: Dict[str, Any]) -> bool:
    global TOKEN

    try:
        r = SESSION.post(GPS_URL, json=payload, headers=headers(), timeout=8)
        if 200 <= r.status_code < 300:
            return True

        if r.status_code in (401, 403):
            print("Token expiré/invalide -> relogin...")
            TOKEN = None
            if login():
                r2 = SESSION.post(GPS_URL, json=payload, headers=headers(), timeout=8)
                return 200 <= r2.status_code < 300

        print(f"API {r.status_code}: {r.text}")
        return False

    except Exception as e:
        print(f"Erreur HTTP: {e}")
        return False


def main():
    print(f"Série : {SERIAL_PORT} @ {BAUDRATE}")
    print(f"API   : {API_BASE}")

    if not login():
        return

    try:
        ser = serial.Serial(SERIAL_PORT, BAUDRATE, timeout=1)
        print(f"Connecté à {SERIAL_PORT}")
    except Exception as e:
        print(f"Impossible d'ouvrir {SERIAL_PORT}: {e}")
        return

    while True:
        try:
            raw = ser.readline()
            if not raw:
                continue

            line = raw.decode("utf-8", errors="ignore").strip()
            if not line:
                continue

            print(f"RX: {line}")

            payload = parse_any(line)
            if not payload:
                print("Ignoré (pas de LAT/LON détectables)")
                continue

            if post_gps(payload):
                print(f"Envoyé [{payload['boat_name']}]: {payload['latitude']:.6f}, {payload['longitude']:.6f}")
            else:
                print("Non envoyé")

        except serial.SerialException:
            print("Connexion série perdue. Reconnexion dans 5s...")
            time.sleep(5)
            try:
                ser = serial.Serial(SERIAL_PORT, BAUDRATE, timeout=1)
                print(f"Reconnecté à {SERIAL_PORT}")
            except:
                pass
        except Exception as e:
            print(f"Erreur: {e}")
            time.sleep(1)
if __name__ == "__main__":
    main()
