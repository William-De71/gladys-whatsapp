# WhatsApp

## Überblick

Chatten Sie mit Gladys auf WhatsApp, über die offizielle **WhatsApp Business Cloud API** von Meta. Jeder Gladys-Benutzer verknüpft seine WhatsApp-Nummer; seine Nachrichten erreichen Gladys, die ihm auf WhatsApp antwortet und ihm dort ihre Benachrichtigungen sendet. Szenen können auf empfangene Nachrichten reagieren (Schaltflächen von Vorlagen, Standorte …) und genehmigte Nachrichtenvorlagen senden.

Die Integration nutzt die Cloud von Meta (`graph.facebook.com`): Die mit Gladys ausgetauschten Texte verlassen Ihr lokales Netzwerk. Zum Empfangen von Nachrichten ist **Gladys Plus** nötig, das Meta eine öffentliche HTTPS-Adresse bereitstellt; ohne Gladys Plus kann Gladys nur senden.

## Voraussetzungen

- Gladys Assistant 5.3.0 oder neuer.
- Eine [Meta-App](https://developers.facebook.com/apps) vom Typ Business mit dem Produkt **WhatsApp** und eine geschäftliche Telefonnummer. Die von Meta bereitgestellte Testnummer funktioniert auch, erreicht aber nur die 5 unter WhatsApp → API-Einrichtung registrierten Nummern.
- Ein **Systembenutzer** (Unternehmenseinstellungen → Benutzer → Systembenutzer), dem die App und das WhatsApp-Konto zugewiesen sind, mit einem Token **ohne Ablauf** und den Berechtigungen `whatsapp_business_messaging` und `whatsapp_business_management`. Das temporäre Token der API-Einrichtung läuft nach 24 Stunden ab.
- Gladys Plus, um Nachrichten zu empfangen.
- Meta rechnet die Nachrichten eines Unternehmens nach seiner Preisliste ab (insbesondere Vorlagen außerhalb des 24-Stunden-Fensters).

## Konfiguration

| Feld                                         | Was einzugeben ist                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Telefonnummer-ID                             | Die unter WhatsApp → API-Einrichtung angezeigte ID (nicht die Nummer)                       |
| Zugriffstoken                                | Das dauerhafte Token des Systembenutzers                                                    |
| ID des WhatsApp-Business-Kontos              | Optional: Damit registriert die Integration ihren Webhook bei Meta und listet Ihre Vorlagen |
| Verifizierungstoken                          | Leer lassen: Die Integration erzeugt es; bei Meta einfügen                                  |
| Webhook registrieren                         | Standardmäßig an: Der Webhook des Kontos folgt der Gladys-Plus-URL                          |
| Ersatzvorlage                                | Name einer genehmigten Vorlage mit einer Variablen im Text, z. B. `gladys_notification`     |
| Sprache der Vorlage                          | Ihr Sprachcode wie im WhatsApp Manager: `en_US`, `fr`, `de`, `es` …                         |
| Empfangene Nachrichten als gelesen markieren | Blaue Häkchen für den Absender                                                              |
| Sprache der Antworten                        | Sprache der Antworten, bevor eine Nummer verknüpft ist                                      |

**Nachrichten empfangen**: Speichern Sie im Block **Gladys-Plus-Webhooks** Ihren Open-API-Schlüssel (Gladys Plus → Einstellungen → Open API). Danach erscheint die Webhook-URL. Öffnen Sie in der Meta-App WhatsApp → Konfiguration, fügen Sie diese URL als **Callback-URL** und das Verifizierungstoken der Integration als **Verifizierungstoken** ein und abonnieren Sie das Feld **messages**. Ist die ID des WhatsApp-Business-Kontos eingetragen, richtet die Integration den Webhook des Kontos außerdem selbst auf diese URL aus, erneut bei jeder Änderung der URL (die Schaltfläche **Webhook registrieren** tut es auf Anfrage).

**Das 24-Stunden-Fenster**: WhatsApp erlaubt einem Unternehmen freien Text nur innerhalb von 24 Stunden nach der letzten Nachricht des Nutzers. Legen Sie im WhatsApp Manager eine Vorlage an (Kategorie Utility, eine Variable im Text, z. B. `Gladys: {{1}}`), warten Sie auf die Genehmigung und geben Sie ihren Namen ein: Außerhalb des Fensters sendet Gladys ihre Nachrichten darüber. Ohne Vorlage lehnt Meta diese Nachrichten ab.

## Verwendung

**Nummer verknüpfen**: Auf der Konfigurationsseite **Mein Konto verknüpfen** → einen Code erzeugen und diesen Code innerhalb von 15 Minuten auf WhatsApp an die geschäftliche Nummer senden. Gladys antwortet, dass Ihr Konto verknüpft ist. Schreiben Sie Gladys dann wie im Chat von Gladys.

Ohne Gladys Plus verwenden Sie die Schaltfläche **Nummer ohne Gladys Plus verknüpfen**: Geben Sie Ihre Nummer (internationales Format) und den Code ein. Gladys sendet Ihnen dann ihre Benachrichtigungen über die Ersatzvorlage; Ihre Nachrichten erreichen Gladys nicht.

Textnachrichten, getippte Schaltflächen und Bildunterschriften gehen an Gladys. Sprachnachrichten, Sticker und andere Medien erhalten die Antwort „Gladys liest vorerst nur Textnachrichten“. Nachrichten nicht verknüpfter Nummern werden ohne Antwort ignoriert.

**Dashboard-Widget**: Das Widget **WhatsApp** zeigt den verifizierten Namen der Nummer, ihre Qualitätsbewertung und ihr Sendelimit, die seit Mitternacht (UTC) gesendeten, empfangenen und fehlgeschlagenen Nachrichten, den Status der Nummer bei Meta, den Zustand des Empfangs, das letzte Ereignis von Meta und die Zahl der verknüpften Kontakte.

![Das WhatsApp-Widget (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-whatsapp/main/docs/assets/widgets.de.png)

**Szenen**:

- Auslöser **WhatsApp-Nachricht empfangen**: Filter nach Nachrichtentyp, Nutzlast einer Schaltfläche, genauem Text. Variablen: `from`, `contact_name`, `user`, `message_type`, `text`, `payload`, `latitude`, `longitude`, `emoji`, `message_id`.
- Auslöser **WhatsApp-Nachricht nicht zugestellt**: der erste Fehler für eine Nummer, danach erst wieder, nachdem eine Nachricht durchgegangen ist (eine Szene, die Sie über WhatsApp warnt, kann keine Schleife bilden). Variablen: `to`, `reason`, `error_code`, `error_title`, `message_id`.
- Aktion **WhatsApp-Vorlage senden**: Empfänger (leer: alle verknüpften Kontakte), Name der Vorlage, Sprache, durch `|` getrennte Parameter (oder `name=wert` für benannte Parameter). Szenenvariablen funktionieren in jedem Feld.

Beispiele: Wenn die Vorlagen-Schaltfläche mit der Nutzlast `OPEN_GATE` getippt wird → das Tor öffnen; wenn die Alarmanlage auslöst → die Vorlage `alarm_alert` an alle senden; wenn eine Nachricht wegen des Tokens nicht zugestellt wird → eine E-Mail senden.

## Fehlerbehebung

- **Verbindung testen** zeigt Name, Qualität und Status der Nummer und ob der Empfang funktioniert.
- **„Meta hat das Zugriffstoken abgelehnt“**: Das Token ist abgelaufen (temporäres Token) oder wurde widerrufen. Erzeugen Sie ein dauerhaftes Token für den Systembenutzer.
- **Nichts kommt in Gladys an**: Prüfen Sie, ob Gladys Plus verknüpft und der Open-API-Schlüssel gespeichert ist, ob URL und Verifizierungstoken bei Meta eingefügt sind und ob das Feld **messages** abonniert ist. Das Widget zeigt „wartet auf Meta“ bis zum ersten Ereignis.
- **Nachricht nicht zugestellt, außerhalb des Fensters (131047)**: Richten Sie eine genehmigte Ersatzvorlage ein.
- **Nummer nicht zugelassen (131030)**: Fügen Sie bei der Testnummer von Meta den Empfänger unter WhatsApp → API-Einrichtung hinzu.
- **Vorlage abgelehnt (132000, 132001)**: Prüfen Sie Name, Sprachcode und Anzahl der Parameter.
- Drücken Sie **Diagnose** und kopieren Sie die Zeilen, die mit „WhatsApp diagnostic“ beginnen, aus dem Tab Protokolle in ein [GitHub-Issue](https://github.com/William-De71/gladys-whatsapp/issues): Token, Open-API-Schlüssel und Nummern sind entfernt oder maskiert.
