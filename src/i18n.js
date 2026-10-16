// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: replies sent on WhatsApp before a contact is linked, messages of the
// Configuration screen, widget contents. Vocabulary of the Gladys interface
// (intégration, scène / Szene / escena) and of Meta (modèle de message /
// Nachrichtenvorlage / plantilla de mensaje).
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // --- replies on WhatsApp ---------------------------------------------------
  linkOk: {
    en: 'Hello {name}, your WhatsApp is now linked to Gladys. Write to me here whenever you like.',
    fr: 'Bonjour {name}, votre WhatsApp est maintenant lié à Gladys. Écrivez-moi ici quand vous voulez.',
    de: 'Hallo {name}, Ihr WhatsApp ist jetzt mit Gladys verknüpft. Schreiben Sie mir hier, wann immer Sie möchten.',
    es: 'Hola {name}, su WhatsApp ya está vinculado a Gladys. Escríbame aquí cuando quiera.',
  },
  linkInvalid: {
    en: 'This link code is invalid or has expired. Generate a new one in Gladys (Integrations → WhatsApp → Link my account) and send it again within 15 minutes.',
    fr: 'Ce code de liaison est invalide ou a expiré. Générez-en un nouveau dans Gladys (Intégrations → WhatsApp → Lier mon compte) et renvoyez-le dans les 15 minutes.',
    de: 'Dieser Verknüpfungscode ist ungültig oder abgelaufen. Erzeugen Sie in Gladys einen neuen (Integrationen → WhatsApp → Mein Konto verknüpfen) und senden Sie ihn innerhalb von 15 Minuten.',
    es: 'Este código de vinculación no es válido o ha caducado. Genere uno nuevo en Gladys (Integraciones → WhatsApp → Vincular mi cuenta) y envíelo de nuevo en menos de 15 minutos.',
  },
  unsupported: {
    en: 'Gladys only reads text messages for now: write your request instead.',
    fr: 'Gladys ne lit que les messages texte pour le moment : écrivez plutôt votre demande.',
    de: 'Gladys liest vorerst nur Textnachrichten: Schreiben Sie Ihre Anfrage bitte als Text.',
    es: 'Por ahora Gladys solo lee mensajes de texto: escriba su petición.',
  },

  // --- Configuration screen ----------------------------------------------------
  notConfigured: {
    en: 'Fill in the phone number ID and the access token of your WhatsApp Business account.',
    fr: "Renseignez l'identifiant du numéro de téléphone et le jeton d'accès de votre compte WhatsApp Business.",
    de: 'Geben Sie die Telefonnummer-ID und das Zugriffstoken Ihres WhatsApp-Business-Kontos ein.',
    es: 'Indique el identificador del número de teléfono y el token de acceso de su cuenta de WhatsApp Business.',
  },
  tokenInvalid: {
    en: 'Meta refused the access token (expired or revoked): generate a permanent token for a system user and paste it again.',
    fr: "Meta a refusé le jeton d'accès (expiré ou révoqué) : générez un jeton permanent pour un utilisateur système et recollez-le.",
    de: 'Meta hat das Zugriffstoken abgelehnt (abgelaufen oder widerrufen): Erzeugen Sie ein dauerhaftes Token für einen Systembenutzer und fügen Sie es erneut ein.',
    es: 'Meta ha rechazado el token de acceso (caducado o revocado): genere un token permanente para un usuario del sistema y péguelo de nuevo.',
  },
  permissionDenied: {
    en: 'The access token cannot use this phone number: give the system user the WhatsApp account and the whatsapp_business_messaging permission.',
    fr: "Le jeton d'accès ne peut pas utiliser ce numéro : donnez à l'utilisateur système le compte WhatsApp et l'autorisation whatsapp_business_messaging.",
    de: 'Das Zugriffstoken darf diese Nummer nicht nutzen: Geben Sie dem Systembenutzer das WhatsApp-Konto und die Berechtigung whatsapp_business_messaging.',
    es: 'El token de acceso no puede usar este número: dé al usuario del sistema la cuenta de WhatsApp y el permiso whatsapp_business_messaging.',
  },
  apiError: {
    en: 'The WhatsApp Cloud API answered with an error: {error}',
    fr: "L'API WhatsApp Cloud a répondu par une erreur : {error}",
    de: 'Die WhatsApp Cloud API hat mit einem Fehler geantwortet: {error}',
    es: 'La API de WhatsApp Cloud ha respondido con un error: {error}',
  },
  testOk: {
    en: 'Connected to {name} ({number}). Quality: {quality}, status: {status}. Reception: {reception}.',
    fr: 'Connecté à {name} ({number}). Qualité : {quality}, statut : {status}. Réception : {reception}.',
    de: 'Verbunden mit {name} ({number}). Qualität: {quality}, Status: {status}. Empfang: {reception}.',
    es: 'Conectado a {name} ({number}). Calidad: {quality}, estado: {status}. Recepción: {reception}.',
  },
  registerOk: {
    en: 'Webhook registered at Meta: the messages of your WhatsApp Business account now reach Gladys through Gladys Plus.',
    fr: 'Webhook enregistré chez Meta : les messages de votre compte WhatsApp Business arrivent maintenant dans Gladys via Gladys Plus.',
    de: 'Webhook bei Meta registriert: Die Nachrichten Ihres WhatsApp-Business-Kontos erreichen Gladys jetzt über Gladys Plus.',
    es: 'Webhook registrado en Meta: los mensajes de su cuenta de WhatsApp Business llegan ahora a Gladys a través de Gladys Plus.',
  },
  registerNoPlus: {
    en: 'Gladys Plus webhooks are not active: link Gladys Plus, then save your Open API key in the "Gladys Plus webhooks" block of this screen.',
    fr: 'Les webhooks Gladys Plus ne sont pas actifs : liez Gladys Plus, puis enregistrez votre clé Open API dans le bloc « Webhooks Gladys Plus » de cet écran.',
    de: 'Die Gladys-Plus-Webhooks sind nicht aktiv: Verknüpfen Sie Gladys Plus und speichern Sie dann Ihren Open-API-Schlüssel im Block „Gladys-Plus-Webhooks“ dieser Seite.',
    es: 'Los webhooks de Gladys Plus no están activos: vincule Gladys Plus y guarde su clave Open API en el bloque «Webhooks de Gladys Plus» de esta pantalla.',
  },
  registerNoAccount: {
    en: 'Fill in the WhatsApp Business account ID to register the webhook automatically, or paste the webhook URL and the verify token in Meta (WhatsApp → Configuration).',
    fr: "Renseignez l'identifiant du compte WhatsApp Business pour enregistrer le webhook automatiquement, ou collez l'URL du webhook et le jeton de vérification dans Meta (WhatsApp → Configuration).",
    de: 'Geben Sie die ID des WhatsApp-Business-Kontos ein, um den Webhook automatisch zu registrieren, oder fügen Sie Webhook-URL und Verifizierungstoken bei Meta ein (WhatsApp → Konfiguration).',
    es: 'Indique el identificador de la cuenta de WhatsApp Business para registrar el webhook automáticamente, o pegue la URL del webhook y el token de verificación en Meta (WhatsApp → Configuración).',
  },
  registerTooLong: {
    en: 'The Gladys Plus webhook URL is longer than the 200 characters Meta accepts for an automatic registration: paste it in Meta (WhatsApp → Configuration) instead.',
    fr: "L'URL du webhook Gladys Plus dépasse les 200 caractères que Meta accepte pour un enregistrement automatique : collez-la plutôt dans Meta (WhatsApp → Configuration).",
    de: 'Die Webhook-URL von Gladys Plus ist länger als die 200 Zeichen, die Meta für eine automatische Registrierung akzeptiert: Fügen Sie sie stattdessen bei Meta ein (WhatsApp → Konfiguration).',
    es: 'La URL del webhook de Gladys Plus supera los 200 caracteres que Meta acepta para un registro automático: péguela en Meta (WhatsApp → Configuración).',
  },
  registerFailed: {
    en: 'Meta refused the webhook: {error}',
    fr: 'Meta a refusé le webhook : {error}',
    de: 'Meta hat den Webhook abgelehnt: {error}',
    es: 'Meta ha rechazado el webhook: {error}',
  },
  linkNumberOk: {
    en: 'The number {number} is now linked to {name}: Gladys sends their messages there.',
    fr: 'Le numéro {number} est maintenant lié à {name} : Gladys y envoie ses messages.',
    de: 'Die Nummer {number} ist jetzt mit {name} verknüpft: Gladys sendet die Nachrichten dorthin.',
    es: 'El número {number} está ahora vinculado a {name}: Gladys le envía allí sus mensajes.',
  },
  linkNumberInvalid: {
    en: 'Enter the WhatsApp number in international format and a link code generated less than 15 minutes ago.',
    fr: 'Saisissez le numéro WhatsApp au format international et un code de liaison généré il y a moins de 15 minutes.',
    de: 'Geben Sie die WhatsApp-Nummer im internationalen Format und einen vor weniger als 15 Minuten erzeugten Verknüpfungscode ein.',
    es: 'Introduzca el número de WhatsApp en formato internacional y un código de vinculación generado hace menos de 15 minutos.',
  },
  linkNumberExpired: {
    en: 'Gladys refused this link code (invalid, already used or expired): generate a new one in "Link my account".',
    fr: 'Gladys a refusé ce code de liaison (invalide, déjà utilisé ou expiré) : générez-en un nouveau dans « Lier mon compte ».',
    de: 'Gladys hat diesen Verknüpfungscode abgelehnt (ungültig, bereits verwendet oder abgelaufen): Erzeugen Sie unter „Mein Konto verknüpfen“ einen neuen.',
    es: 'Gladys ha rechazado este código de vinculación (no válido, ya usado o caducado): genere uno nuevo en «Vincular mi cuenta».',
  },
  diagnosticDone: {
    en: 'Diagnostic written to the Logs tab. Copy the lines starting with "WhatsApp diagnostic" into your report: token, Open API key and phone numbers are left out or masked.',
    fr: "Diagnostic écrit dans l'onglet Journaux. Copiez les lignes « WhatsApp diagnostic » dans votre retour : jeton, clé Open API et numéros en sont retirés ou masqués.",
    de: 'Diagnose in den Tab Protokolle geschrieben. Kopieren Sie die Zeilen „WhatsApp diagnostic“ in Ihre Meldung: Token, Open-API-Schlüssel und Nummern sind entfernt oder maskiert.',
    es: 'Diagnóstico escrito en la pestaña Registros. Copie las líneas «WhatsApp diagnostic» en su informe: token, clave Open API y números se omiten o se enmascaran.',
  },

  // --- reception ---------------------------------------------------------------
  reception_active: { en: 'active', fr: 'active', de: 'aktiv', es: 'activa' },
  reception_waiting: {
    en: 'waiting for Meta',
    fr: 'en attente de Meta',
    de: 'wartet auf Meta',
    es: 'esperando a Meta',
  },
  reception_off: {
    en: 'off (no Gladys Plus)',
    fr: 'coupée (sans Gladys Plus)',
    de: 'aus (ohne Gladys Plus)',
    es: 'apagada (sin Gladys Plus)',
  },

  // --- widget --------------------------------------------------------------------
  widgetNotConfigured: {
    en: 'The integration is not configured yet: fill in the phone number ID and the access token.',
    fr: "L'intégration n'est pas encore configurée : renseignez l'identifiant du numéro et le jeton d'accès.",
    de: 'Die Integration ist noch nicht eingerichtet: Geben Sie die Telefonnummer-ID und das Zugriffstoken ein.',
    es: 'La integración aún no está configurada: indique el identificador del número y el token de acceso.',
  },
  widgetNotRead: {
    en: 'The phone number has not been read from Meta yet.',
    fr: "Le numéro n'a pas encore été lu chez Meta.",
    de: 'Die Nummer wurde noch nicht bei Meta gelesen.',
    es: 'El número aún no se ha leído en Meta.',
  },
  tileQuality: { en: 'Quality', fr: 'Qualité', de: 'Qualität', es: 'Calidad' },
  tileLimit: { en: 'Limit / 24 h', fr: 'Limite / 24 h', de: 'Limit / 24 h', es: 'Límite / 24 h' },
  tileSent: { en: 'Sent', fr: 'Envoyés', de: 'Gesendet', es: 'Enviados' },
  tileReceived: { en: 'Received', fr: 'Reçus', de: 'Empfangen', es: 'Recibidos' },
  tileFailed: { en: 'Failed', fr: 'Échecs', de: 'Fehler', es: 'Fallidos' },
  captionToday: {
    en: 'Messages since midnight (UTC)',
    fr: 'Messages depuis minuit (UTC)',
    de: 'Nachrichten seit Mitternacht (UTC)',
    es: 'Mensajes desde medianoche (UTC)',
  },
  quality_GREEN: { en: 'High', fr: 'Haute', de: 'Hoch', es: 'Alta' },
  quality_YELLOW: { en: 'Medium', fr: 'Moyenne', de: 'Mittel', es: 'Media' },
  quality_RED: { en: 'Low', fr: 'Basse', de: 'Niedrig', es: 'Baja' },
  quality_unknown: { en: 'Unknown', fr: 'Inconnue', de: 'Unbekannt', es: 'Desconocida' },
  limit_unlimited: { en: 'Unlimited', fr: 'Illimitée', de: 'Unbegrenzt', es: 'Ilimitado' },
  rowNumber: { en: 'Number', fr: 'Numéro', de: 'Nummer', es: 'Número' },
  rowReception: { en: 'Reception', fr: 'Réception', de: 'Empfang', es: 'Recepción' },
  rowLastWebhook: {
    en: 'Last event from Meta',
    fr: 'Dernier événement Meta',
    de: 'Letztes Ereignis von Meta',
    es: 'Último evento de Meta',
  },
  rowContacts: {
    en: 'Linked contacts',
    fr: 'Contacts liés',
    de: 'Verknüpfte Kontakte',
    es: 'Contactos vinculados',
  },
  never: { en: 'never', fr: 'jamais', de: 'nie', es: 'nunca' },
  status_CONNECTED: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  status_PENDING: { en: 'Pending', fr: 'En attente', de: 'Ausstehend', es: 'Pendiente' },
  status_FLAGGED: { en: 'Flagged', fr: 'Signalé', de: 'Markiert', es: 'Marcado' },
  status_RESTRICTED: { en: 'Restricted', fr: 'Restreint', de: 'Eingeschränkt', es: 'Restringido' },
  status_DISCONNECTED: {
    en: 'Disconnected',
    fr: 'Déconnecté',
    de: 'Getrennt',
    es: 'Desconectado',
  },
  status_RATE_LIMITED: { en: 'Rate limited', fr: 'Bridé', de: 'Gedrosselt', es: 'Limitado' },
  status_unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  ago_now: { en: 'just now', fr: "à l'instant", de: 'gerade eben', es: 'ahora mismo' },
  ago_minutes: { en: '{n} min ago', fr: 'il y a {n} min', de: 'vor {n} Min.', es: 'hace {n} min' },
  ago_hours: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  ago_days: { en: '{n} d ago', fr: 'il y a {n} j', de: 'vor {n} T.', es: 'hace {n} d' },
};

const isLanguage = (language) => LANGUAGES.includes(language);

/**
 * @description A text in a language, with its placeholders replaced.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('linkOk', 'fr', { name: 'Alice' });
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string} key - The TEXTS key.
 * @param {object|Function} [values] - The substitutions, or a function of the
 * language returning them.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('registerFailed', { error: 'Invalid OAuth access token (#190)' });
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description "12 min ago" for an instant.
 * @param {number|null} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The relative time, "never" without an instant.
 * @example
 * ago(Date.now() - 600000, Date.now(), 'en'); // -> '10 min ago'
 */
function ago(instant, now, language) {
  if (!Number.isFinite(instant)) {
    return t('never', language);
  }
  const minutes = Math.max(0, Math.floor((now - instant) / 60000));
  if (minutes < 1) {
    return t('ago_now', language);
  }
  if (minutes < 60) {
    return t('ago_minutes', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('ago_hours', language, { n: hours });
  }
  return t('ago_days', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, ago };
