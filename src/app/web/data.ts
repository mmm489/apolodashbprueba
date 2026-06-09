// Datos de contenido de la web pública de la gelateria Apolo.
// Centralizados aquí para reutilizar entre páginas (inicio, carta, etc.).

export type ProductFamily = {
  slug: string;
  name: string;
  emoji: string;
  tagline: string;
  items: string[];
};

// Familias del TPV (ver CLAUDE.md) presentadas de cara al público.
export const productFamilies: ProductFamily[] = [
  {
    slug: "gelats",
    name: "Gelados",
    emoji: "🍦",
    tagline: "Nuestro corazón artesano",
    items: ["Vainilla de Madagascar", "Stracciatella", "Pistacho", "Fresa natural", "Chocolate intenso", "Avellana"],
  },
  {
    slug: "frozen-iogurt",
    name: "Frozen Yogurt",
    emoji: "🥣",
    tagline: "Ligero, cremoso y con toppings",
    items: ["Yogur natural", "Yogur con frutos rojos", "Yogur de coco"],
  },
  {
    slug: "batuts",
    name: "Batidos",
    emoji: "🥤",
    tagline: "Cremosos de helado natural",
    items: ["Batido de vainilla", "Batido de chocolate", "Batido de fresa", "Batido de Oreo"],
  },
  {
    slug: "smoothies",
    name: "Smoothies",
    emoji: "🍓",
    tagline: "Fruta natural y energía",
    items: ["Mango", "Frutos rojos", "Tropical", "Verde detox"],
  },
  {
    slug: "frappes",
    name: "Frappés",
    emoji: "🧊",
    tagline: "Frescor para el verano de Salou",
    items: ["Frappé de café", "Frappé de caramelo", "Frappé de chocolate"],
  },
  {
    slug: "crepes",
    name: "Crepes & Gofres",
    emoji: "🥞",
    tagline: "Recién hechos, dulces o salados",
    items: ["Crepe Nutella", "Crepe fresa y nata", "Gofre con helado", "Gofre 3 chocolates"],
  },
  {
    slug: "cafes",
    name: "Cafés",
    emoji: "☕",
    tagline: "Espresso de tueste natural",
    items: ["Espresso", "Cappuccino", "Latte", "Café con helado (affogato)"],
  },
  {
    slug: "granissats",
    name: "Granizados & Horchata",
    emoji: "🍋",
    tagline: "El clásico mediterráneo",
    items: ["Granizado de limón", "Granizado de café", "Horchata de chufa"],
  },
];

export type Location = {
  name: string;
  address: string;
  city: string;
  hours: { days: string; time: string }[];
  mapsQuery: string;
};

export const locations: Location[] = [
  {
    name: "Apolo Salou · Paseo",
    address: "Passeig Jaume I, Salou",
    city: "43840 Salou, Tarragona",
    hours: [
      { days: "Lunes a Jueves", time: "12:00 – 00:00" },
      { days: "Viernes y Sábado", time: "11:00 – 01:30" },
      { days: "Domingo", time: "11:00 – 00:00" },
    ],
    mapsQuery: "Passeig Jaume I, Salou, Tarragona",
  },
];

export const navLinks = [
  { href: "/web", label: "Inicio" },
  { href: "/web/carta", label: "Carta" },
  { href: "/web/nosotros", label: "Nosotros" },
  { href: "/web/ubicaciones", label: "Ubicaciones" },
  { href: "/web/contacto", label: "Contacto" },
];

export const contact = {
  phone: "+34 977 00 00 00",
  email: "hola@gelateriaapolo.com",
  instagram: "@gelateriaapolo",
};
