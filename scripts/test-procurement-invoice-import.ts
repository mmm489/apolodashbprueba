import assert from "node:assert/strict";

import {
  detectInvoiceConsumables,
  inferLatestReliablePackCost,
  inferPack,
  isSaleLinkedPhysicalStock,
  normalizeConsumableDescription,
  type InvoiceConsumableLine,
} from "../src/lib/procurement-invoice-import";

function line(overrides: Partial<InvoiceConsumableLine>): InvoiceConsumableLine {
  return {
    invoiceLineId: "line-1",
    supplierName: "Makro Distribucion Mayorista, S.A.",
    issueDate: "2026-07-01",
    category: "materia_prima",
    description: "Producto",
    quantity: 1,
    unitPrice: 10,
    amount: 10,
    ...overrides,
  };
}

const detected = detectInvoiceConsumables([
  line({ invoiceLineId: "cup-1", category: "envases", description: "VASO PET 500ML, 100 UDS" }),
  line({ invoiceLineId: "cup-2", category: "envases", description: "VASO PET 500ML 100UD." }),
  line({ invoiceLineId: "cup-3", category: "envases", description: "VASO PET 330ML 100UD" }),
]);
assert.equal(detected.candidates.length, 2, "Las variantes de 500 ml se agrupan y 330 ml permanece separado");
assert.equal(normalizeConsumableDescription("VASO PET 500ML, 100 UDS"), normalizeConsumableDescription("VASO PET 500ML 100UD."));
assert.equal(
  normalizeConsumableDescription("ABARÁN HC26/677 de 20/07/2026. AVELLANA UHT 1L (12L CJ.) LOT, 125 VTC, 07/27"),
  normalizeConsumableDescription("AVELLANA UHT 1L (12L C.)"),
);

const estrella = line({ description: "ESTRELLA DAMM 24UDS", quantity: 24, unitPrice: 0.48, amount: 11.52 });
const estrellaPack = inferPack(estrella.description);
assert.deepEqual(estrellaPack, { unit: "ud", packSize: 24 });
assert.equal(inferLatestReliablePackCost([estrella], estrellaPack), 11.52);

const tarrina = line({ description: "TARRINA T12 C/400UD", quantity: 1, unitPrice: 19.9, amount: 19.9 });
const tarrinaPack = inferPack(tarrina.description);
assert.deepEqual(tarrinaPack, { unit: "ud", packSize: 400 });
assert.equal(inferLatestReliablePackCost([tarrina], tarrinaPack), 19.9);
assert.deepEqual(inferPack("TARRINA CARTON T16 (C/300)"), { unit: "ud", packSize: 300 });
assert.deepEqual(inferPack("PALETINA CAFE 1.000u ENFUND."), { unit: "ud", packSize: 1000 });
assert.deepEqual(inferPack("SERVILLETA 20 X 20 2C GC NEGRA (3000)"), { unit: "ud", packSize: 3000 });

const nutella = line({ description: "NUTELLA 3KG", quantity: 1, unitPrice: 21.59, amount: 21.59 });
const nutellaPack = inferPack(nutella.description);
assert.deepEqual(nutellaPack, { unit: "g", packSize: 3000 });
assert.equal(inferLatestReliablePackCost([nutella], nutellaPack), 21.59);

for (const excluded of [
  line({ description: "GASOLINA 95" }),
  line({ supplierName: "Adobe", description: "Licencia Acrobat" }),
  line({ description: "DESCUENTO PROMOCION" }),
  line({ description: "GASTOS DE ENVIO" }),
  line({ description: "DETERGENTE LAVAVAJILLAS" }),
  line({ description: "RACIONADOR HELADO 51MM" }),
]) assert.equal(isSaleLinkedPhysicalStock(excluded), false, excluded.description);

console.log("Procurement invoice import rules: OK");
