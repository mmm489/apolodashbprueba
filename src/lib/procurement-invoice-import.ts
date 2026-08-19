import { buildCanonicalSupplierNames, normalizeSupplierKey } from "@/lib/supplier-names";

export type InvoiceConsumableLine = {
  invoiceLineId: string;
  supplierName: string;
  issueDate: string;
  category: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type InvoiceConsumableSource = {
  sourceKey: string;
  consumableKey: string;
  supplierKey: string;
  supplierName: string;
  sourceDescription: string;
  normalizedDescription: string;
  firstSeenDate: string;
  lastSeenDate: string;
  lastInvoiceLineId: string;
  occurrences: number;
};

export type InvoiceConsumableCandidate = {
  consumableKey: string;
  name: string;
  supplierName: string;
  unit: string;
  packSize: number;
  packCost: number;
  sources: InvoiceConsumableSource[];
};

export type InvoiceConsumableDetection = {
  processed: number;
  accepted: number;
  discarded: number;
  grouped: number;
  candidates: InvoiceConsumableCandidate[];
};

type PackInfo = { unit: string; packSize: number };

const NON_STOCK_PATTERN = new RegExp([
  "ABONO", "ALQUILER", "ANTENA", "APARCAMIENTO", "ACROBAT", "BATERIA", "CABLE",
  "COMBUSTIBLE", "COMISION", "CUOTA", "DESCUENTO", "ELECTRIC", "ENVIO",
  "ESTACIONAMIENTO", "FORMACION", "GASOLINA", "IMPUESTO", "INCREMENTO COMBUSTIBLE",
  "LICENCIA", "MANTENIMIENTO", "MATERIAL ELECTR", "NOTIFICACION", "PORTES", "PROMOCION",
  "PROMO ", "RATON", "RECEPTOR", "RENTING", "SATELIT", "SERVICIO", "SOFTWARE",
  "SUBTOTAL", "TASA", "TIEMPO EXTRACCION", "TRAMPA", "TRANSPORTE",
].join("|"));

const CLEANING_PATTERN = new RegExp([
  "AMBIENTADOR", "BAYETA", "BOLSA BASURA", "DESENGRASANTE", "DESINFECTANTE",
  "DETERGENTE", "ESCOBA", "ESTROPAJO", "GUANTE", "HIG INDUSTRIAL", "JABON", "LAVAVAJILLAS",
  "LEJIA", "LIMPIADOR", "LIMPIASUELOS", "MOPA", "PAPEL HIGIENICO", "QUITAGRASAS",
  "ROLLO B B", "SECAMANOS",
].join("|"));

const NON_OPERATIONAL_SUPPLIER_PATTERN = new RegExp([
  "ADOBE", "AJUNTAMENT", "CAIXABANK EQUIPMENT", "MARPA ASSESSORS",
].join("|"));

const EQUIPMENT_PATTERN = /^(?:DOSIFICADOR|RACIONADOR)\b/;

const TRUSTED_OPERATIONAL_SUPPLIER_PATTERN = new RegExp([
  "CAFE NOVELL", "CINMAQ", "DIEXCA", "FRANCOLI", "HI CREAM BCN", "LIDL",
  "MAKRO", "MANUELA 17", "MONTANE MUNTANE", "STENGER", "YOGUFRUTA",
].join("|"));

const SALE_STOCK_PATTERN = boundedPattern([
  "7UP", "AGUA", "AIGUA", "AQUARIUS", "ATUN", "AVELLANA", "AZUCAR", "BANANA",
  "BANDEJA", "BARQUILLA", "BEBIDA", "BEGUDA", "BERLIN(?:A|AS|ES)?", "CAFE", "CACAO",
  "CANYETA", "CARAMELO", "CERVEZA", "CHAI", "CHERRY", "CHOCOLATE", "CHOCOLATA",
  "COCA COLA", "COCO", "CONO", "COOKIE(?:S)?", "CREMA", "CREP(?:E|ES)?", "CRUMBLE",
  "CUCHARA", "CUCHARITA", "CUCHILLO", "CUCURUCHO", "DAMM", "DOLC", "DOUGH", "ENVASE",
  "ESTRELLA", "FAJA(?:S)?", "FANTA", "FESTUC", "FETA", "FRESA", "FRESON", "FRUTA",
  "FRUIT(?:S)?", "GALLET(?:A|AS)?", "GELAT", "GELATS", "GOFRE", "GRANINI", "GRANOLA",
  "HARIBO", "HEINEKEN", "HELADO", "HELADOS", "HIELO", "HORCHATA", "JAMON", "KINDER",
  "LACASITO(?:S)?", "LECHE", "LLET", "LIMON", "LOTUS", "MADUIXA", "MANGO", "MARACUJA",
  "MATCHA", "MENTA", "MIEL", "MUESLI", "NATA", "NESTEA", "NUBE(?:S)?", "NUTELLA", "OREO",
  "ORXATA", "PAJITA", "PALETA", "PALETINA", "PAN", "PERNIL", "PISTACHO", "PISTATXO",
  "PLATANO", "QUESO", "QSO", "REFRESCO", "RUCA", "RUCULA", "SALSA", "SERVILLETA",
  "SMOOTHIE", "SUCRE", "TAPA", "TARRINA", "TENEDOR", "TONICA", "TURRO", "VAINILLA",
  "VASO", "VILADRAU", "WAFFLE", "XOCOLATA", "YOGUR", "YOGURT", "CHURRO", "XURRO",
]);

const TRUSTED_SALE_STOCK_PATTERN = boundedPattern([
  "AROMA", "BASE", "CAPSULA", "COBERTURA", "CONCENTRADO", "CROCANT", "PASTA", "POLVO",
  "PREPARADO", "PURE", "SIROPE", "TOPPING",
]);

export function detectInvoiceConsumables(lines: InvoiceConsumableLine[]): InvoiceConsumableDetection {
  const canonicalSuppliers = buildCanonicalSupplierNames(lines.map((line) => line.supplierName));
  const accepted = lines.filter(isSaleLinkedPhysicalStock);
  const candidatesByKey = new Map<string, InvoiceConsumableLine[]>();

  for (const line of accepted) {
    const consumableKey = normalizeConsumableDescription(line.description);
    if (!consumableKey) continue;
    const current = candidatesByKey.get(consumableKey) ?? [];
    current.push(line);
    candidatesByKey.set(consumableKey, current);
  }

  const candidates = [...candidatesByKey.entries()].map(([consumableKey, candidateLines]) => {
    const sorted = [...candidateLines].sort(compareNewestFirst);
    const latest = sorted[0];
    const pack = inferPack(latest.description);
    const sourcesByKey = new Map<string, InvoiceConsumableLine[]>();

    for (const line of sorted) {
      const supplierKey = normalizeSupplierKey(line.supplierName);
      const normalizedDescription = normalizeConsumableDescription(line.description);
      const sourceKey = `${supplierKey}|${normalizedDescription}`;
      const sourceLines = sourcesByKey.get(sourceKey) ?? [];
      sourceLines.push(line);
      sourcesByKey.set(sourceKey, sourceLines);
    }

    const sources = [...sourcesByKey.entries()].map(([sourceKey, sourceLines]) => {
      const ordered = [...sourceLines].sort(compareNewestFirst);
      const newest = ordered[0];
      const oldest = ordered[ordered.length - 1];
      const supplierKey = normalizeSupplierKey(newest.supplierName);
      return {
        sourceKey,
        consumableKey,
        supplierKey,
        supplierName: canonicalSuppliers.get(supplierKey) ?? newest.supplierName.trim(),
        sourceDescription: newest.description.trim(),
        normalizedDescription: normalizeConsumableDescription(newest.description),
        firstSeenDate: oldest.issueDate,
        lastSeenDate: newest.issueDate,
        lastInvoiceLineId: newest.invoiceLineId,
        occurrences: sourceLines.length,
      } satisfies InvoiceConsumableSource;
    });

    const latestSupplierKey = normalizeSupplierKey(latest.supplierName);
    return {
      consumableKey,
      name: cleanConsumableName(latest.description),
      supplierName: canonicalSuppliers.get(latestSupplierKey) ?? latest.supplierName.trim(),
      unit: pack.unit,
      packSize: pack.packSize,
      packCost: inferLatestReliablePackCost(sorted, pack),
      sources,
    } satisfies InvoiceConsumableCandidate;
  }).sort((a, b) => a.supplierName.localeCompare(b.supplierName, "es") || a.name.localeCompare(b.name, "es"));

  const acceptedCount = accepted.length;
  return {
    processed: lines.length,
    accepted: acceptedCount,
    discarded: lines.length - acceptedCount,
    grouped: Math.max(0, acceptedCount - candidates.length),
    candidates,
  };
}

export function isSaleLinkedPhysicalStock(line: InvoiceConsumableLine) {
  if (!line.description.trim() || !Number.isFinite(line.amount) || line.amount <= 0) return false;
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) return false;
  const description = normalizeText(line.description);
  const supplier = normalizeText(line.supplierName);
  if (NON_STOCK_PATTERN.test(description) || CLEANING_PATTERN.test(description)) return false;
  if (EQUIPMENT_PATTERN.test(description)) return false;
  if (NON_OPERATIONAL_SUPPLIER_PATTERN.test(supplier)) return false;
  if (SALE_STOCK_PATTERN.test(description)) return true;
  return TRUSTED_OPERATIONAL_SUPPLIER_PATTERN.test(supplier) && TRUSTED_SALE_STOCK_PATTERN.test(description);
}

export function normalizeConsumableDescription(value: string) {
  return normalizeText(stripVariableDescriptionParts(value))
    .replace(/^PN\s+/, "")
    .replace(/^[A-Z]{2,6}\d{3,}\s+/, "")
    .replace(/\bAGUA ANTES CREUS\b/g, "AGUA SANTES CREUS")
    .replace(/\bVILDRAU\b/g, "VILADRAU")
    .replace(/\bZERO DATA\b/g, "ZERO LATA")
    .replace(/\bSCHWEPES\b/g, "SCHWEPPES")
    .replace(/\bBANDEJA GREP\b/g, "BANDEJA CREP")
    .replace(/\b(?:CANARTAS|CAMAITAS)\b/g, "CANARIAS")
    .replace(/\bCANARIAS TGP\b/g, "CANARIAS IGP")
    .replace(/\bHI CREMA\b/g, "HI CREAM")
    .replace(/\bMETALIC(?:A)?\b/g, "METALICA")
    .replace(/(\d)[,.](\d)/g, "$1DECIMAL$2")
    .replace(/[.,]+/g, " ")
    .replace(/DECIMAL/g, ".")
    .replace(/\b(?:UDS?|UNIDADES)\b/g, "UD")
    .replace(/(\d)\s*(UD|ML|CL|KG|GRS?|G|L)\b/g, "$1 $2")
    .replace(/\bC\s+(?=\d+\s*UD\b)/g, "")
    .replace(/\b(\d+)\s+L\s+C(?:\s*J)?\b/g, "$1 L CAJA")
    .replace(/\s+(?:AX|BJ|CJ|LT|PK|PQ|RT|TA|P\s+BJ)$/g, "")
    .replace(/\s+(?:CB|BL)$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanConsumableName(value: string) {
  return stripVariableDescriptionParts(value)
    .replace(/^\s*PN[-\s]+/i, "")
    .replace(/^\s*[A-Z]{2,6}\d{3,}\s+/i, "")
    .replace(/\s+(?:CB|BL)\s*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

export function inferPack(description: string): PackInfo {
  const normalized = normalizeText(description).replace(/,/g, ".");
  const rawParenthesizedCount = description.match(/\((\d{2,6})\)/);
  const unitMultiplier = normalized.match(/(\d+(?:\.\d+)?)\s*(?:UDS?|UNIDADES|UTS?|PCS|U)\s*[X]\s*(\d+(?:\.\d+)?)/);
  if (unitMultiplier) {
    return {
      unit: "ud",
      packSize: roundQuantity(parseCount(unitMultiplier[1]) * parseCount(unitMultiplier[2])),
    };
  }

  const unitMatches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(?:UDS?|UNIDADES|UTS?|PCS|U)\b/g)];
  if (unitMatches.length > 0) {
    return { unit: "ud", packSize: roundQuantity(parseCount(unitMatches.at(-1)![1])) };
  }

  const caseCount = normalized.match(/\bC\s+(\d+(?:\.\d+)?)\b/);
  if (caseCount) return { unit: "ud", packSize: roundQuantity(parseCount(caseCount[1])) };

  const kgMultiplier = normalized.match(/(\d+(?:\.\d+)?)\s*X\s*(\d+(?:\.\d+)?)\s*KG\b/);
  if (kgMultiplier) return { unit: "g", packSize: roundQuantity(Number(kgMultiplier[1]) * Number(kgMultiplier[2]) * 1000) };
  const litreMultiplier = normalized.match(/(\d+(?:\.\d+)?)\s*X\s*(\d+(?:\.\d+)?)\s*L\b/);
  if (litreMultiplier) return { unit: "ml", packSize: roundQuantity(Number(litreMultiplier[1]) * Number(litreMultiplier[2]) * 1000) };

  const measurement = normalized.match(/(\d+(?:\.\d+)?)\s*(KG|GRS?|G|ML|CL|L)\b/);
  if (measurement) {
    const value = parseMeasurement(measurement[1]);
    const measure = measurement[2];
    if (measure === "KG") return { unit: "g", packSize: roundQuantity(value * 1000) };
    if (measure === "GR" || measure === "GRS" || measure === "G") return { unit: "g", packSize: roundQuantity(value) };
    if (measure === "L") return { unit: "ml", packSize: roundQuantity(value * 1000) };
    if (measure === "CL") return { unit: "ml", packSize: roundQuantity(value * 10) };
    return { unit: "ml", packSize: roundQuantity(value) };
  }

  if (rawParenthesizedCount) {
    return { unit: "ud", packSize: roundQuantity(Number(rawParenthesizedCount[1])) };
  }

  if (/\bKG\b/.test(normalized)) return { unit: "g", packSize: 1000 };
  return { unit: "ud", packSize: 1 };
}

function parseCount(value: string) {
  return /^\d{1,3}\.\d{3}$/.test(value) ? Number(value.replace(".", "")) : Number(value);
}

function parseMeasurement(value: string) {
  return /^\d{1,3}\.\d{3}$/.test(value) ? Number(value.replace(".", "")) : Number(value);
}

export function inferLatestReliablePackCost(lines: InvoiceConsumableLine[], pack: PackInfo) {
  const ordered = [...lines].sort(compareNewestFirst);
  for (const line of ordered) {
    const inferred = inferLinePackCost(line, pack);
    if (inferred.reliable && inferred.cost > 0) return roundMoney(inferred.cost);
  }
  for (const line of ordered) {
    const inferred = inferLinePackCost(line, pack);
    if (inferred.cost > 0) return roundMoney(inferred.cost);
  }
  return 0;
}

function inferLinePackCost(line: InvoiceConsumableLine, pack: PackInfo) {
  const quantity = Math.max(0, line.quantity);
  const unitPrice = Math.max(0, line.unitPrice);
  const amount = Math.max(0, line.amount);
  if (unitPrice <= 0 && amount <= 0) return { cost: 0, reliable: false };
  if (pack.unit !== "ud" || pack.packSize <= 1) {
    if (unitPrice > 0 && quantity > 0 && approximately(amount, unitPrice * quantity)) return { cost: unitPrice, reliable: true };
    return { cost: unitPrice || (quantity > 0 ? amount / quantity : amount), reliable: false };
  }

  const packedUnitCost = unitPrice * pack.packSize;
  if (quantity >= pack.packSize * 0.9 && unitPrice > 0) return { cost: packedUnitCost, reliable: true };
  if (quantity > 0 && unitPrice > 0 && approximately(amount, unitPrice * quantity)) return { cost: unitPrice, reliable: true };
  if (quantity > 0 && unitPrice > 0 && approximately(amount, packedUnitCost * quantity)) return { cost: packedUnitCost, reliable: true };
  if (quantity > 0 && approximately(amount / quantity, packedUnitCost)) return { cost: packedUnitCost, reliable: true };
  return { cost: quantity > 0 ? amount / quantity : unitPrice, reliable: false };
}

function stripVariableDescriptionParts(value: string) {
  return value
    .replace(/^\s*(?:ABARAN|ACARAN|ABARÁN|ACARÁN)\s+HC\d+\/\d+\s+DE\s+\d{1,2}\/\d{1,2}\/\d{4}[.,-]?\s*/i, "")
    .replace(/\s*[-,]?\s*partidas?\s*:.*$/i, "")
    .replace(/\s*[,.-]?\s*(?:LOT|LOTE)\b.*$/i, "")
    .replace(/\s*[,.-]?\s*VTC?\b.*$/i, "")
    .replace(/\s+\d+[,.]\d+\s*x\s*\(\s*\d+[,.]\d+\s*\)\s*$/i, "")
    .replace(/\s*\((?:segundo|x\d+)\)\s*$/i, "")
    .replace(/,\s*\d+\s+paquetes?\s+.*$/i, "")
    .trim();
}

function compareNewestFirst(a: InvoiceConsumableLine, b: InvoiceConsumableLine) {
  return b.issueDate.localeCompare(a.issueDate) || b.invoiceLineId.localeCompare(a.invoiceLineId);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/&/g, " Y ")
    .replace(/[^A-Z0-9.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function boundedPattern(terms: string[]) {
  return new RegExp(`(?:^|\\s)(?:${terms.join("|")})(?=$|\\s|[.,;:/()-])`);
}

function approximately(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= Math.max(0.08, Math.abs(b) * 0.04);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
