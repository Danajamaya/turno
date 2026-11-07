// Strings for the public pages, Spanish and English. Pure: usable in client components.
export type Lang = "es" | "en";

const dict = {
  es: {
    findGuide: "Encuentra tu guía", findSub: "Tours con guías locales: compara, mira sus horarios y reserva en un minuto.",
    city: "Ciudad", language: "Idioma", interest: "Interés", date: "Fecha", any: "Cualquiera", search: "Buscar",
    results: (n: number) => `${n} ${n === 1 ? "resultado" : "resultados"}`, noResults: "No encontramos guías con esos filtros. Prueba quitando alguno.",
    from: "Desde", tip: "A la voluntad", perPerson: "por persona", perGroup: (n: number) => `por grupo · hasta ${n}`, tipSub: "pagas lo que quieras al final",
    tours: (n: number) => `${n} ${n === 1 ? "tour" : "tours"}`, reviews: (n: number) => `${n} ${n === 1 ? "reseña" : "reseñas"}`, newGuide: "Nuevo",
    about: "Sobre nosotros", toursPackages: "Tours y paquetes", noTours: "Todavía no hay tours publicados.", travellers: (n: string) => `${n} viajeros guiados`,
    reviewsTitle: "Lo que dicen los viajeros", reviewsSoon: "Las reseñas aparecerán aquí tras los primeros tours.", verified: "Reserva verificada",
    pick: "Elige día y hora", none: "No hay salidas en las próximas dos semanas.", full: "Completo", left: (n: number) => `Quedan ${n}`, free: "Plazas libres",
    people: "Personas", name: "Tu nombre", email: "Correo", emailHelp: "Te mandamos la confirmación", phone: "Teléfono (opcional)", phoneHelp: "Por si el guía necesita avisarte", book: "Reservar",
    confirmed: "¡Reserva confirmada!", confirmedSub: "Te mandamos los detalles por correo.", tour: "Tour", when: "Cuándo", meeting: "Punto de encuentro", payment: "Pago", code: "Código",
    payTip: "A la voluntad, al final", payOnSite: (m: string) => `${m} en el punto de encuentro`, otherTours: (c: string) => `Ver otros tours de ${c}`,
    rateTitle: "¿Qué te pareció?", rateSub: (t: string, c: string) => `Tu opinión sobre «${t}» ayuda a ${c} y a otros viajeros.`, stars: "Tu valoración", comment: "Cuéntanos (opcional)",
    yourName: "Tu nombre (como aparecerá)", send: "Enviar reseña", thanks: "¡Gracias por tu reseña!", alreadySent: "Ya enviaste esta reseña. ¡Gracias!", linkInvalid: "Este enlace no es válido.",
    poweredBy: "Reservas con",
  },
  en: {
    findGuide: "Find your guide", findSub: "Tours with local guides: compare, check their times and book in a minute.",
    city: "City", language: "Language", interest: "Interest", date: "Date", any: "Any", search: "Search",
    results: (n: number) => `${n} ${n === 1 ? "result" : "results"}`, noResults: "No guides match those filters. Try removing one.",
    from: "From", tip: "Pay what you want", perPerson: "per person", perGroup: (n: number) => `per group · up to ${n}`, tipSub: "you pay what you like at the end",
    tours: (n: number) => `${n} ${n === 1 ? "tour" : "tours"}`, reviews: (n: number) => `${n} ${n === 1 ? "review" : "reviews"}`, newGuide: "New",
    about: "About us", toursPackages: "Tours and packages", noTours: "No tours published yet.", travellers: (n: string) => `${n} travellers guided`,
    reviewsTitle: "What travellers say", reviewsSoon: "Reviews will appear here after the first tours.", verified: "Verified booking",
    pick: "Pick a day and time", none: "No departures in the next two weeks.", full: "Full", left: (n: number) => `${n} left`, free: "Places available",
    people: "People", name: "Your name", email: "Email", emailHelp: "We'll send your confirmation", phone: "Phone (optional)", phoneHelp: "In case the guide needs to reach you", book: "Book",
    confirmed: "Booking confirmed!", confirmedSub: "We've emailed you the details.", tour: "Tour", when: "When", meeting: "Meeting point", payment: "Payment", code: "Code",
    payTip: "Pay what you want, at the end", payOnSite: (m: string) => `${m} at the meeting point`, otherTours: (c: string) => `More tours by ${c}`,
    rateTitle: "How was it?", rateSub: (t: string, c: string) => `Your opinion about "${t}" helps ${c} and other travellers.`, stars: "Your rating", comment: "Tell us more (optional)",
    yourName: "Your name (as shown)", send: "Send review", thanks: "Thanks for your review!", alreadySent: "You already sent this review. Thank you!", linkInvalid: "This link isn't valid.",
    poweredBy: "Bookings by",
  },
} as const;

export const t = (lang: Lang) => dict[lang];
export const localeOf = (lang: Lang) => (lang === "en" ? "en-GB" : "es-ES");
