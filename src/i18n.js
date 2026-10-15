// -----------------------------------------------------------------------------
// Every text the integration produces, in the four languages of the Gladys
// interface. German says "du", Spanish "usted" (test/i18n.test.js checks the
// German). Vocabulary taken from the Gladys front (front/src/config/i18n).
//
// Feature names are written once, when the user adds the device: they follow
// the `language` setting of the configuration (default French), like the
// names of the mode options.
// -----------------------------------------------------------------------------

// Feature names, by feature key (src/devices.js).
export const NAMES = {
  en: {
    temperature: 'Temperature',
    target: 'Set-point',
    mode: 'Mode',
    heating: 'Heating',
    power: 'Power',
    energy_today: 'Energy today',
    energy_index: 'Energy index',
    humidity: 'Humidity',
    co2: 'CO2 (estimated)',
    tvoc: 'TVOC',
    battery: 'Battery',
    pm25: 'PM2.5',
    pm10: 'PM10',
    child_lock: 'Child lock',
    window_open: 'Open window detected',
    frost_protection: 'Frost protection',
  },
  fr: {
    temperature: 'Température',
    target: 'Consigne',
    mode: 'Mode',
    heating: 'Chauffe',
    power: 'Puissance',
    energy_today: "Énergie aujourd'hui",
    energy_index: 'Index énergie',
    humidity: 'Humidité',
    co2: 'CO2 (estimé)',
    tvoc: 'COV totaux',
    battery: 'Batterie',
    pm25: 'PM2.5',
    pm10: 'PM10',
    child_lock: 'Sécurité enfant',
    window_open: 'Fenêtre ouverte détectée',
    frost_protection: 'Hors-gel',
  },
  de: {
    temperature: 'Temperatur',
    target: 'Solltemperatur',
    mode: 'Modus',
    heating: 'Heizt',
    power: 'Leistung',
    energy_today: 'Energie heute',
    energy_index: 'Energieindex',
    humidity: 'Luftfeuchtigkeit',
    co2: 'CO2 (geschätzt)',
    tvoc: 'TVOC',
    battery: 'Batterie',
    pm25: 'PM2.5',
    pm10: 'PM10',
    child_lock: 'Kindersicherung',
    window_open: 'Offenes Fenster erkannt',
    frost_protection: 'Frostschutz',
  },
  es: {
    temperature: 'Temperatura',
    target: 'Consigna',
    mode: 'Modo',
    heating: 'Calentando',
    power: 'Potencia',
    energy_today: 'Energía de hoy',
    energy_index: 'Índice de energía',
    humidity: 'Humedad',
    co2: 'CO2 (estimado)',
    tvoc: 'COV totales',
    battery: 'Batería',
    pm25: 'PM2.5',
    pm10: 'PM10',
    child_lock: 'Bloqueo infantil',
    window_open: 'Ventana abierta detectada',
    frost_protection: 'Antihielo',
  },
};

// Labels of the thermostat mode options (supported_options), by Gladys value.
export const MODE_LABELS = {
  en: { 0: 'Off', 1: 'Individual set-point', 3: 'Weekly programme' },
  fr: { 0: 'Arrêt', 1: 'Consigne individuelle', 3: 'Programme hebdomadaire' },
  de: { 0: 'Aus', 1: 'Eigene Solltemperatur', 3: 'Wochenprogramm' },
  es: { 0: 'Apagado', 1: 'Consigna individual', 3: 'Programa semanal' },
};

// Messages of the Configuration screen (connection status, action results).
export const MESSAGES = {
  notConfigured: {
    en: 'Enter your Mill account or the address of a Gen 3 heater.',
    fr: "Saisissez votre compte Mill ou l'adresse d'un radiateur Gen 3.",
    de: 'Gib dein Mill-Konto oder die Adresse eines Gen-3-Heizkörpers ein.',
    es: 'Introduzca su cuenta Mill o la dirección de un radiador Gen 3.',
  },
  authFailed: {
    en: 'Mill account refused: check the e-mail address and the password.',
    fr: "Compte Mill refusé : vérifiez l'adresse e-mail et le mot de passe.",
    de: 'Mill-Konto abgelehnt: Prüfe E-Mail-Adresse und Passwort.',
    es: 'Cuenta Mill rechazada: compruebe la dirección de correo y la contraseña.',
  },
  cloudUnreachable: {
    en: 'The Mill cloud does not answer, new attempt soon.',
    fr: 'Le cloud Mill ne répond pas, nouvel essai bientôt.',
    de: 'Die Mill-Cloud antwortet nicht, neuer Versuch in Kürze.',
    es: 'La nube Mill no responde, nuevo intento en breve.',
  },
  localUnreachable: {
    en: 'No Mill heater answers on the local network.',
    fr: 'Aucun radiateur Mill ne répond sur le réseau local.',
    de: 'Kein Mill-Heizkörper antwortet im lokalen Netzwerk.',
    es: 'Ningún radiador Mill responde en la red local.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
    de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
};

// Report of the "Test the connection" action, one table per language.
export const REPORT = {
  en: {
    cloudOk: (count) => `Mill cloud: connected, ${count} device(s).`,
    cloudAuth: 'Mill cloud: account refused, check the e-mail address and the password.',
    cloudError: (reason) => `Mill cloud: ${reason}.`,
    cloudOff: 'Mill cloud: not configured.',
    localOk: (host, name) => `${host}: ${name}, answers.`,
    localError: (host, reason) => `${host}: ${reason}.`,
    localOff: 'Local heaters: none configured.',
    ignored: (list) => `Ignored addresses: ${list}.`,
  },
  fr: {
    cloudOk: (count) => `Cloud Mill : connecté, ${count} appareil(s).`,
    cloudAuth: "Cloud Mill : compte refusé, vérifiez l'adresse e-mail et le mot de passe.",
    cloudError: (reason) => `Cloud Mill : ${reason}.`,
    cloudOff: 'Cloud Mill : non configuré.',
    localOk: (host, name) => `${host} : ${name}, répond.`,
    localError: (host, reason) => `${host} : ${reason}.`,
    localOff: 'Radiateurs locaux : aucun configuré.',
    ignored: (list) => `Adresses ignorées : ${list}.`,
  },
  de: {
    cloudOk: (count) => `Mill-Cloud: verbunden, ${count} Gerät(e).`,
    cloudAuth: 'Mill-Cloud: Konto abgelehnt, prüfe E-Mail-Adresse und Passwort.',
    cloudError: (reason) => `Mill-Cloud: ${reason}.`,
    cloudOff: 'Mill-Cloud: nicht eingerichtet.',
    localOk: (host, name) => `${host}: ${name}, antwortet.`,
    localError: (host, reason) => `${host}: ${reason}.`,
    localOff: 'Lokale Heizkörper: keiner eingerichtet.',
    ignored: (list) => `Ignorierte Adressen: ${list}.`,
  },
  es: {
    cloudOk: (count) => `Nube Mill: conectada, ${count} dispositivo(s).`,
    cloudAuth: 'Nube Mill: cuenta rechazada, compruebe la dirección de correo y la contraseña.',
    cloudError: (reason) => `Nube Mill: ${reason}.`,
    cloudOff: 'Nube Mill: no configurada.',
    localOk: (host, name) => `${host}: ${name}, responde.`,
    localError: (host, reason) => `${host}: ${reason}.`,
    localOff: 'Radiadores locales: ninguno configurado.',
    ignored: (list) => `Direcciones ignoradas: ${list}.`,
  },
};

// Texts of the dashboard widget (short: tiles, buttons, status rows).
export const WIDGET_TEXT = {
  power: { en: 'Power', fr: 'Puissance', de: 'Leistung', es: 'Potencia' },
  heating: { en: 'Heating', fr: 'En chauffe', de: 'Heizt', es: 'Calentando' },
  idle: { en: 'Idle', fr: 'Au repos', de: 'Inaktiv', es: 'Inactivo' },
  off: { en: 'Off', fr: 'Arrêt', de: 'Aus', es: 'Apagado' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  allWeekly: {
    en: 'All: programme',
    fr: 'Tous : programme',
    de: 'Alle: Programm',
    es: 'Todos: programa',
  },
  allOff: { en: 'All off', fr: 'Tout éteindre', de: 'Alle aus', es: 'Apagar todos' },
  empty: {
    en: 'No Mill heater added to Gladys yet.',
    fr: 'Aucun radiateur Mill ajouté à Gladys pour le moment.',
    de: 'Noch kein Mill-Heizkörper zu Gladys hinzugefügt.',
    es: 'Todavía no se ha añadido ningún radiador Mill a Gladys.',
  },
  done: {
    en: '{count} heater(s) changed.',
    fr: '{count} radiateur(s) modifié(s).',
    de: '{count} Heizkörper geändert.',
    es: '{count} radiador(es) modificado(s).',
  },
  partial: {
    en: '{count} heater(s) changed, {failed} did not answer.',
    fr: '{count} radiateur(s) modifié(s), {failed} sans réponse.',
    de: '{count} Heizkörper geändert, {failed} ohne Antwort.',
    es: '{count} radiador(es) modificado(s), {failed} sin respuesta.',
  },
};

/** Fill `{name}` placeholders of every language of a multi-language text. */
export function fill(text, values) {
  return Object.fromEntries(
    Object.entries(text).map(([lang, value]) => [
      lang,
      value.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? '')),
    ]),
  );
}
