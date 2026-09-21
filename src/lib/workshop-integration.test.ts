import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkshopPayment, validSecret } from "./workshop-integration";

const valid = {
  externalId: "whatsapp:60123456789:ABC123",
  whatsappJid: "60123456789@s.whatsapp.net",
  customerName: "OOI IAN TING",
  customerPhone: "+60123456789",
  customerEmail: null,
  session: "penang",
  amount: 168,
  paidOn: "2026-09-21",
  reference: "ABC123",
};

test("accepts a valid workshop payment", () => {
  assert.deepEqual(parseWorkshopPayment(valid), valid);
});

test("rejects invalid amount, session, and WhatsApp IDs", () => {
  assert.ok("error" in parseWorkshopPayment({ ...valid, amount: 0 }));
  assert.ok("error" in parseWorkshopPayment({ ...valid, session: "johor" }));
  assert.ok("error" in parseWorkshopPayment({ ...valid, whatsappJid: "group@g.us" }));
});

test("compares bearer secrets without a plain string comparison", () => {
  assert.equal(validSecret("Bearer integration-secret", "integration-secret"), true);
  assert.equal(validSecret("Bearer incorrect", "integration-secret"), false);
  assert.equal(validSecret(null, "integration-secret"), false);
});
