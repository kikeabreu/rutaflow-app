const test=require("node:test");
const assert=require("node:assert/strict");

process.env.TZ="America/Merida";
const{dateKey,localDateTime,toStorageInstant,deviceTimeZone}=require("../src/dateUtils");

test("keeps the device-local day when UTC is already on the next day",()=>{
  const stored=toStorageInstant("2026-08-31T23:30");
  assert.equal(stored,"2026-09-01T05:30:00.000Z");
  assert.equal(dateKey(stored),"2026-08-31");
  assert.equal(localDateTime(stored),"2026-08-31T23:30");
});

test("treats date-only values as local calendar dates",()=>{
  assert.equal(dateKey("2026-09-01"),"2026-09-01");
});

test("reports the browser runtime time zone",()=>{
  assert.equal(deviceTimeZone(),"America/Merida");
});
