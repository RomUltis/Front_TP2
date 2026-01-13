#include <Arduino.h>
#include <math.h>

static const char* BOAT_NAME = "Endurance";
static const unsigned long INTERVAL_MS = 60000UL; // 1 minute

unsigned long lastSend = 0;
const double LAT_MIN = 40.0;
const double LAT_MAX = 55.0;
const double LON_MIN = -30.0;
const double LON_MAX = 5.0;

double latDec = 47.800000;
double lonDec = -8.500000;
double speedKnots = 12.0;
double courseDeg  = 260.0;

bool seeded = false;
double clampDouble(double v, double minV, double maxV) {
  if (v < minV) return minV;
  if (v > maxV) return maxV;
  return v;
}

double randDouble(double minV, double maxV) {
  return minV + ((double)random(0, 1000000) / 1000000.0) * (maxV - minV);
}

void seedRandomOnce() {
  if (seeded) return;
  unsigned long seed = millis();
  seed ^= micros();
  seed ^= analogRead(A0);
  randomSeed(seed);
  seeded = true;
}

String degToNmea(double deg, bool isLat, char &hemisphere) {
  hemisphere = (deg >= 0) ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W');
  deg = fabs(deg);

  int d = (int)deg;
  double minutes = (deg - d) * 60.0;

  char buf[20];
  if (isLat) {
    snprintf(buf, sizeof(buf), "%02d%07.4f", d, minutes); // ddmm.mmmm
  } else {
    snprintf(buf, sizeof(buf), "%03d%07.4f", d, minutes); // dddmm.mmmm
  }
  return String(buf);
}

uint8_t nmeaChecksum(const char* s) {
  uint8_t cs = 0;
  while (*s) cs ^= (uint8_t)*s++;
  return cs;
}

void moveBoatOneMinute() {
  speedKnots += randDouble(-0.8, 0.8);
  speedKnots = clampDouble(speedKnots, 2.0, 25.0);

  courseDeg += randDouble(-8.0, 8.0);
  if (courseDeg < 0) courseDeg += 360.0;
  if (courseDeg >= 360.0) courseDeg -= 360.0;
  double speedKmh   = speedKnots * 1.852;
  double distanceKm = speedKmh / 60.0;
  double courseRad = courseDeg * M_PI / 180.0;
  double deltaLat  = (distanceKm / 111.0) * cos(courseRad);
  double lonFactor = 111.0 * cos(latDec * M_PI / 180.0);
  if (lonFactor < 1e-6) lonFactor = 1e-6;
  double deltaLon = (distanceKm / lonFactor) * sin(courseRad);

  latDec += deltaLat;
  lonDec += deltaLon;
  latDec = clampDouble(latDec, -89.9999, 89.9999);
  lonDec = clampDouble(lonDec, -179.9999, 179.9999);

  if (latDec < LAT_MIN) { latDec = LAT_MIN; courseDeg = 0.0;   }
  if (latDec > LAT_MAX) { latDec = LAT_MAX; courseDeg = 180.0; }
  if (lonDec < LON_MIN) { lonDec = LON_MIN; courseDeg = 90.0;  }
  if (lonDec > LON_MAX) { lonDec = LON_MAX; courseDeg = 270.0; }
}

void setup() {
  Serial.begin(9600);
  seedRandomOnce();
  Serial.println("--- GPS SIMULATOR READY (1 boat moving, safe) ---");
}

void loop() {
  unsigned long now = millis();
  if (now - lastSend < INTERVAL_MS) return;
  lastSend = now;

  seedRandomOnce();
  moveBoatOneMinute();

  if (!isfinite(latDec) || !isfinite(lonDec)) {
    Serial.println("WARN: invalid position (NaN/inf) -> frame skipped");
    return;
  }

  unsigned long t = (now / 1000UL) % 86400UL;
  char timeBuf[10];
  snprintf(timeBuf, sizeof(timeBuf), "%02lu%02lu%02lu",
           t / 3600, (t / 60) % 60, t % 60);

  char hemiLat, hemiLon;
  String latNmea = degToNmea(latDec, true, hemiLat);
  String lonNmea = degToNmea(lonDec, false, hemiLon);

  char sBuf[12], cBuf[12];
  dtostrf(speedKnots, 1, 1, sBuf);
  dtostrf(courseDeg,  1, 1, cBuf);

  String payload = "GPRMC," + String(timeBuf) + ",A," +
                   latNmea + "," + String(hemiLat) + "," +
                   lonNmea + "," + String(hemiLon) + "," +
                   String(sBuf) + "," + String(cBuf) + ",060126,,A";

  uint8_t cs = nmeaChecksum(payload.c_str());
  Serial.print("BOAT="); Serial.print(BOAT_NAME);
  Serial.print(";LAT="); Serial.print(latDec, 6);
  Serial.print(";LON="); Serial.print(lonDec, 6);
  Serial.print(";RAW=$"); Serial.print(payload);
  Serial.print("*");
  if (cs < 16) Serial.print('0');
  Serial.println(cs, HEX);
}
