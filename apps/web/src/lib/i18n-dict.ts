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
    where: "Dónde", whereHint: "¿A qué ciudad vas?", whenHint: "Cualquier día", all: "Todo", toursIn: (c: string) => `Tours en ${c}`, toursAll: "Tours con guías locales",
    meetGuides: "Conoce a los guías", byGuide: (c: string, city: string) => city ? `Con ${c}, en ${city}` : `Con ${c}`, save: (t: string) => `Guardar ${t}`,
    trial: "Tour de prueba", startsAt: (h: string) => `Sale a las ${h}`, langs: (l: string[]) => l.join(", "), heroLine: "Recorre la ciudad con quien la vive",
    bookCard: "Reserva tu tour", seeTimes: "Ver horarios", nextDeps: "Próximas salidas", noFee: "Sin pagar por adelantado", instant: "Confirmación al momento", more: (n: number) => `${n} fechas más`, waitTitle: "Esta salida está completa.", waitSub: "Apúntate y te escribimos si se libera una plaza.", waitJoin: "Avísame", giftCode: "Código regalo (opcional)", discountCode: "Código de descuento (opcional)", googleAsk: (c: string) => `¿Nos ayudas también con una reseña en Google? A ${c} le cambia mucho.`, googleButton: "Dejar reseña en Google", quoteTitle: "Grupos, colegios y empresas", quoteSub: "Cuéntanos tu grupo y te mandamos un presupuesto.", quoteSize: "Tamaño del grupo", quoteDate: "Fecha aproximada", quoteName: "Nombre de contacto", quoteEmail: "Email de contacto", quoteKind: "Tipo de grupo", quoteKinds: ["Colegio o instituto", "Empresa", "Despedida o celebración", "Familia o amigos", "Otro"], quoteSend: "Pedir presupuesto", quoteOk: "Enviado. Te mandamos el presupuesto por correo.", discountHelp: "Por ejemplo, el de tu hotel", depositNote: (m: string) => `Se paga una señal de ${m} por persona al reservar; el resto, en el punto de encuentro.`, noShowNote: (m: string) => `Gratis. Guardamos tu tarjeta y solo se cobran ${m} por persona si no vienes sin avisar.`, route: "Recorrido", verifiedGuide: "Guía verificado: identidad y acreditación revisadas por Turno", giveTour: "Regalar un tour", giftHelp: "Si te regalaron este tour", giftPaid: (m: string) => `Pagado con tarjeta regalo: ${m}`, giftRest: (m: string) => `Pagas en el punto de encuentro: ${m}`,
    verifiedOnly: "Solo opinan viajeros que reservaron", outOf: "de 5", guideSince: "Guías verificados por Turno", sendMessage: "Escribir al guía",
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
    where: "Where", whereHint: "Which city?", whenHint: "Any day", all: "All", toursIn: (c: string) => `Tours in ${c}`, toursAll: "Tours with local guides",
    meetGuides: "Meet the guides", byGuide: (c: string, city: string) => city ? `With ${c}, in ${city}` : `With ${c}`, save: (t: string) => `Save ${t}`,
    trial: "Trial tour", startsAt: (h: string) => `Starts at ${h}`, langs: (l: string[]) => l.join(", "), heroLine: "See the city with someone who lives it",
    bookCard: "Book your tour", seeTimes: "See times", nextDeps: "Next departures", noFee: "Nothing to pay in advance", instant: "Instant confirmation", more: (n: number) => `${n} more dates`, waitTitle: "This departure is full.", waitSub: "Join the list and we will email you if a place opens up.", waitJoin: "Tell me", giftCode: "Gift code (optional)", discountCode: "Discount code (optional)", googleAsk: (c: string) => `Would you also leave a review on Google? It makes a big difference to ${c}.`, googleButton: "Review on Google", quoteTitle: "Groups, schools and companies", quoteSub: "Tell us about your group and we will send a quote.", quoteSize: "Group size", quoteDate: "Approximate date", quoteName: "Contact name", quoteEmail: "Contact email", quoteKind: "Kind of group", quoteKinds: ["School", "Company", "Celebration", "Family or friends", "Other"], quoteSend: "Ask for a quote", quoteOk: "Sent. We will email you a quote.", discountHelp: "For example, from your hotel", depositNote: (m: string) => `A ${m} per person deposit is paid when booking; the rest at the meeting point.`, noShowNote: (m: string) => `Free. We keep your card and only charge ${m} per person if you miss the tour without telling us.`, route: "Route", verifiedGuide: "Verified guide: ID and licence checked by Turno", giveTour: "Give a tour as a gift", giftHelp: "If this tour was a present", giftPaid: (m: string) => `Paid with gift card: ${m}`, giftRest: (m: string) => `Pay at the meeting point: ${m}`,
    verifiedOnly: "Only travellers who booked can review", outOf: "out of 5", guideSince: "Guides verified by Turno", sendMessage: "Message the guide",
  },
} as const;

export const t = (lang: Lang) => dict[lang];
export const localeOf = (lang: Lang) => (lang === "en" ? "en-GB" : "es-ES");
