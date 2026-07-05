/**
 * Single source of truth for product family classification.
 *
 * Every component that groups products by family/category MUST import from
 * here instead of duplicating the rules. Keep this file as the only place
 * where keywords, colors, and family names live.
 */

export interface FamilyRule {
  name: string;
  /** Solid tailwind bg color (e.g. "bg-pink-500"). Used for dots / bars. */
  color: string;
  /** Light badge style "bg-xxx-50 text-xxx-700". Used for pills / chips. */
  bgLight: string;
  keywords: string[];
}

export const familyRules: FamilyRule[] = [
  { name: "Gelats", color: "bg-pink-500", bgLight: "bg-pink-50 text-pink-700",
    keywords: ["cucurutxo", "pot l", "pot m", "pot s", "tupper"] },
  { name: "Granissats", color: "bg-blue-400", bgLight: "bg-blue-50 text-blue-700",
    keywords: ["granitzat", "granissat", "granizado", "granizada"] },
  { name: "Cafes", color: "bg-amber-700", bgLight: "bg-amber-50 text-amber-800",
    keywords: ["cafe", "cafè", "café", "capuccino", "tallat", "expresso", "descafeinat", "descafeïnat",
      "xocolata a la tassa", "cola cao", "bombo", "cafe casa", "cafe veïns", "cafe veins"] },
  { name: "Begudes", color: "bg-sky-500", bgLight: "bg-sky-50 text-sky-700",
    keywords: ["7up", "aigua", "aquarius", "begudes", "bitter", "cacaolat", "coke", "damm", "estrella",
      "fanta", "free damm", "granini", "nestea", "tonica", "casa hi cream"] },
  { name: "Crepes", color: "bg-yellow-500", bgLight: "bg-yellow-50 text-yellow-700",
    keywords: ["crepe", "crepre", "mediterraneo", "mixto", "quesos"] },
  { name: "Hi Pop", color: "bg-violet-500", bgLight: "bg-violet-50 text-violet-700",
    keywords: ["waffle", "sandwich waffle", "sandwic waffle", "hi pop", "sandwic kinder",
      "sandwich nutella", "sandwich pistatxo", "sandwich xocolata", "sandwich salsa"] },
  { name: "Xurros", color: "bg-orange-500", bgLight: "bg-orange-50 text-orange-700",
    keywords: ["xurro", "xurros", "xocolata & xurros"] },
  { name: "Batuts", color: "bg-purple-500", bgLight: "bg-purple-50 text-purple-700",
    keywords: ["batut"] },
  { name: "Especialitats", color: "bg-teal-500", bgLight: "bg-teal-50 text-teal-700",
    keywords: ["matcha", "pistacho latte", "chai", "special"] },
  { name: "Frappes", color: "bg-cyan-500", bgLight: "bg-cyan-50 text-cyan-700",
    keywords: ["frappe", "frapuccino"] },
  { name: "Smoothies", color: "bg-lime-500", bgLight: "bg-lime-50 text-lime-700",
    keywords: ["smoothie"] },
  { name: "Frozen Iogurt", color: "bg-fuchsia-500", bgLight: "bg-fuchsia-50 text-fuchsia-700",
    keywords: ["pot iogurt", "açai", "acai"] },
  { name: "Receptes", color: "bg-rose-500", bgLight: "bg-rose-50 text-rose-700",
    keywords: ["cookies cream", "kinder delight", "lotus receta", "nutella & go", "oreo ice",
      "pistacho receta", "macha receta", "yogurt pasi"] },
  { name: "Ice Drinks", color: "bg-sky-400", bgLight: "bg-sky-50 text-sky-700",
    keywords: ["iced ", "milk cafe", "milk mango", "milk maracuia"] },
  { name: "Berlines", color: "bg-amber-500", bgLight: "bg-amber-50 text-amber-700",
    keywords: ["max kinder", "max lotus", "max oreo", "max pistacho", "mini donut", "berlines"] },
  { name: "Dought", color: "bg-red-400", bgLight: "bg-red-50 text-red-700",
    keywords: ["doght", "dought"] },
  { name: "Infusions", color: "bg-green-400", bgLight: "bg-green-50 text-green-700",
    keywords: ["menta poleo", "english breakfast", "te vert", "camamilla", "roibos"] },
  { name: "Orxata", color: "bg-amber-300", bgLight: "bg-amber-50 text-amber-700",
    keywords: ["orxata"] },
  { name: "Xips", color: "bg-stone-400", bgLight: "bg-stone-50 text-stone-700",
    keywords: ["patates xips"] },
  { name: "Toppings i extres", color: "bg-slate-500", bgLight: "bg-slate-100 text-slate-600",
    keywords: ["sabor ", "salsa", "topping", "nutella 0", "nutella 1", "crispy", "brownie",
      "lacasitos", "lotus pols", "maduixa natural", "nata ", "nube ", "oreo pols", "platan natural",
      "sucre ", "crumble", "pistatxo pols", "gelat avellana", "gelat dulce", "gelat iogurt",
      "gelat kinder", "gelat lotus", "gelat maduixa", "gelat nata", "gelat oreo", "gelat açai",
      "gelat vainilla", "gelat xocolata", "gelat cafe", "gelat cheesecake", "gelat ferrero",
      "gelat menta", "gelat pistaxo", "gelat nutella", "gelat crispetes", "gelat maracuia",
      "gelat mango", "gelat coco", "xoco maduixa", "melmalada", "caramel salat",
      "xocolata pistatxo", "xocolata blanca"] },
  { name: "Varios", color: "bg-gray-400", bgLight: "bg-gray-50 text-gray-600",
    keywords: ["gel", "suplement", "varios", "descafeinat sobre", "sense sucre", "sucre more",
      "llet sense", "llet vegetal"] },
];

const ALTRES: FamilyRule = {
  name: "Altres",
  color: "bg-slate-400",
  bgLight: "bg-slate-50 text-slate-600",
  keywords: [],
};

/** Returns the family rule that matches the product name, or "Altres" if none. */
export function classifyFamily(productName: string): FamilyRule {
  const lower = productName.toLowerCase();
  for (const rule of familyRules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule;
  }
  return ALTRES;
}

/** Shorthand: category name (string) for a given product. */
export function getFamilyName(productName: string): string {
  return classifyFamily(productName).name;
}

/** Returns the solid color class for a known family name (or Altres). */
export function getFamilyColor(name: string): string {
  return familyRules.find((r) => r.name === name)?.color ?? ALTRES.color;
}

/** Returns the light badge color class for a known family name (or Altres). */
export function getFamilyBgLight(name: string): string {
  return familyRules.find((r) => r.name === name)?.bgLight ?? ALTRES.bgLight;
}
