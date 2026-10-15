# Mill

Mill-Heizkörper, -Steckdosen und -Luftsensoren in Gladys, über die Mill-Cloud
(das Konto der Mill-App) und, für die neueren Gen-3-Heizkörper, über ihre
lokale API in deinem Netzwerk.

> **Ohne die Hardware entwickelt: Rückmeldungen willkommen.** Die Integration
> wurde nach den Open-Source-Bibliotheken der Home-Assistant-Integration
> geschrieben, ohne Mill-Konto und ohne Mill-Heizkörper. Wenn dir etwas falsch
> vorkommt, eröffne ein Issue auf
> [GitHub](https://github.com/guim31/gladys-mill/issues).
>
> Diese Integration ist nicht mit Mill International AS verbunden.

## Was sie macht

- Findet alle Heizkörper, Steckdosen, Mill-Sense-Sensoren und Luftreiniger
  deines Mill-Kontos sowie die Gen-3-Heizkörper, die du im lokalen Netzwerk
  angibst.
- Zeigt die gemessene Temperatur, die Solltemperatur, den Modus, ob der
  Heizkörper heizt, die aufgenommene Leistung und die Energie des Tages.
- Ändert Solltemperatur und Modus (aus, eigene Solltemperatur,
  Wochenprogramm) über das Dashboard und über Szenen.
- Zählt einen Energieindex für das Energie-Monitoring von Gladys.
- Löst eine Szene aus, wenn ein Mill-Gerät nicht mehr antwortet.
- Bietet ein Dashboard-Widget mit allen Heizkörpern auf einen Blick.

## Voraussetzungen

- Gladys 5.1.0 oder neuer.
- Für die Cloud: E-Mail-Adresse und Passwort der Mill-App (Mill-Norway-Cloud,
  die App der Gen-2- und Gen-3-Geräte).
- Für den lokalen Modus: ein Mill-Gen-3-Heizkörper, dessen lokale API in der
  Mill-App aktiviert ist, mit einer festen IP-Adresse (eine DHCP-Reservierung
  in deinem Router).

Beides lässt sich kombinieren: die Cloud für Steckdosen und Sensoren, die
lokale API für die Gen-3-Heizkörper.

## Konfiguration

1. Öffne in Gladys **Integrationen → Mill** und fülle das Formular aus:
   - **E-Mail-Adresse** und **Passwort**: dein Mill-Konto. Lass sie leer, um
     nur lokale Heizkörper zu nutzen.
   - **Lokale Adressen**: die IP-Adressen deiner Gen-3-Heizkörper, durch
     Kommas getrennt, z. B. `192.168.1.40, 192.168.1.41`.
   - **Cloud-Aktualisierung**: jede Minute (Standard), alle 2 oder 5 Minuten.
   - **Sprache der Funktionsnamen**: die Namen der Funktionen, wenn ein Gerät
     hinzugefügt wird (standardmäßig Französisch).
   - **Lokale Verbindung bevorzugen** (von Gladys angezeigt): Ist ein
     Gen-3-Heizkörper sowohl in deinem Konto als auch im lokalen Netzwerk,
     wird im Tab Erkennung nur seine lokale Kopie angeboten.
2. Klicke auf **Verbindung testen**: Das Ergebnis listet die Cloud-Geräte und
   jeden lokalen Heizkörper auf.
3. Öffne den Tab **Erkennung** und füge die gewünschten Geräte hinzu.

Das Passwort wird von Gladys in der Konfiguration der Integration gespeichert.
Die Integration hält die Sitzungstoken von Mill in ihrem Volume `/data`, damit
ein Neustart nicht erneut anmeldet.

## Geräte

**Heizkörper und Steckdose** (Cloud) — ein Gerät pro Mill-Gerät:

| Funktion                | Was sie zeigt                                                     |
| ----------------------- | ----------------------------------------------------------------- |
| Temperatur              | Die vom Heizkörper gemessene Temperatur                           |
| Solltemperatur          | Die Zieltemperatur, 5 bis 35 °C, in Schritten von 0,5 °C          |
| Modus                   | Aus, eigene Solltemperatur, Wochenprogramm                        |
| Heizt                   | Ob der Heizkörper gerade heizt                                    |
| Leistung                | Die aufgenommene Leistung in W                                    |
| Energie heute           | Die Energie des Tages in kWh (jede Nacht wieder 0)                |
| Energieindex            | Ein Zähler, der nur wächst, für das Energie-Monitoring            |
| Luftfeuchtigkeit        | Steckdosen mit Sensor                                             |
| Kindersicherung         | Nur lesen                                                         |
| Offenes Fenster erkannt | Der Heizkörper hat einen plötzlichen Temperaturabfall erkannt (1) |
| Frostschutz             | Nur lesen, wenn der Heizkörper ihn meldet                         |

Eine neue Solltemperatur schaltet den Heizkörper in den Modus „eigene
Solltemperatur“, wie es die Mill-App tut: Im Wochenprogramm folgt der
Heizkörper seinem Programm, nicht der Solltemperatur.

**Gen-3-Heizkörper** (lokal) — Temperatur, Solltemperatur, Modus, Heizt,
Leistung und, wenn der Heizkörper sie sendet, Luftfeuchtigkeit,
Kindersicherung und offenes Fenster.

**Mill Sense** (Cloud) — Temperatur, Luftfeuchtigkeit, geschätztes CO2, TVOC,
Batterie.

**Luftreiniger** (Cloud) — Temperatur, Luftfeuchtigkeit, PM2.5 und PM10, wenn
der Luftreiniger sie meldet (nur lesen).

## Dashboard-Widget

**Mill-Heizkörper** zeigt alle zu Gladys hinzugefügten Heizkörper: gemessene
Temperatur, Solltemperatur und Zustand (heizt, inaktiv, aus, offline), die
Gesamtleistung und die Zahl der heizenden Heizkörper. Zwei Knöpfe wirken auf
alle: **Alle: Programm** (zurück zum Wochenprogramm) und **Alle aus** (fragt
nach einer Bestätigung). Die Solltemperatur jedes Heizkörpers bleibt auf den
Thermostat-Widgets von Gladys.

## Szenen-Auslöser und -Aktion

- Auslöser **Mill-Gerät offline**: Ein Mill-Gerät antwortet nicht mehr —
  ausgesteckt, ohne WLAN oder Sicherung ausgelöst. Filtere auf ein Gerät oder
  lass den Filter leer; die Variable `device_name` enthält den Namen des
  Geräts. Ein Ausfall der Mill-Cloud selbst löst nichts aus (die Geräte
  werden als „nicht erreichbar“ angezeigt).
- Aktion **Alle Mill-Heizkörper in einen Modus setzen**: Wochenprogramm,
  eigene Solltemperatur oder aus, für alle zu Gladys hinzugefügten Heizkörper
  und Steckdosen. Die Ausgaben `changed` und `failed` zählen die geänderten
  Heizkörper und die, die nicht geantwortet haben.

## Szenen-Beispiele

- **Haus verlassen**: Wenn die letzte Person geht, starte „Alle
  Mill-Heizkörper in einen Modus setzen“ mit **Aus** — oder mit
  **Wochenprogramm**, wenn das Programm die Temperatur schon absenkt.
- **Fenster geöffnet**: Wenn ein Öffnungssensor des Raums öffnet, setze den
  Modus des Heizkörpers dieses Raums auf **Aus**; wenn er schließt, zurück
  zum **Wochenprogramm**.
- **Sicherung ausgelöst**: Wenn „Mill-Gerät offline“ auslöst, sende eine
  Nachricht „{{device_name}} antwortet nicht mehr“.

## Aktualisierung und Kontingente

Gladys fragt externe Geräte noch nicht zuverlässig ab, deshalb aktualisiert
die Integration sie selbst:

- die Mill-Cloud jede Minute (oder alle 2 oder 5 Minuten): zwei Anfragen pro
  Haus;
- jeden lokalen Heizkörper alle 30 Sekunden.

Nach der ersten Suche werden nur die zu Gladys hinzugefügten Geräte gelesen.
Die Mill-Cloud begrenzt die Anfragen: Antwortet sie mit „zu viele Anfragen“
(HTTP 429), halbiert die Integration ihr Tempo, bis zu einmal alle 30 Minuten,
bis sie wieder antwortet. Ein abgelehntes Passwort stoppt das Lesen der Cloud,
bis du die Konfiguration änderst, damit wiederholte Versuche das Konto nicht
sperren. Nur geänderte Werte werden an Gladys gesendet, ein unveränderter Wert
erneut alle 6 Stunden.

## Fehlerbehebung

- **„Mill-Konto abgelehnt“**: Prüfe E-Mail-Adresse und Passwort in der
  Mill-App und speichere dann die Konfiguration erneut.
- **Ein lokaler Heizkörper antwortet nicht**: Prüfe, ob die lokale API in der
  Mill-App aktiviert ist, ob der Heizkörper seine IP-Adresse behält und ob
  Gladys ihn erreicht (die Integration läuft in einem Container auf dem
  Gladys-Server).
- **Kein Wert bei einer Funktion**: Das Gerät meldet ihn nicht (die Funktion
  bleibt dann leer), oder es ist offline.
- **Ein Cloud-Heizkörper ist „nicht erreichbar“**: Die Mill-Cloud antwortet
  nicht, oder der Heizkörper ist von der Cloud getrennt.
- Die Protokolle der Integration zeigen nur ihren Lebenszyklus (Start,
  Verbindung, Gerät verloren und wieder da, Fehler, deine Aktionen). Die
  Umgebungsvariable `LOG_LEVEL=debug` zeigt jede Aktualisierung.

## Einschränkungen

- Ohne Mill-Gerät und -Konto entwickelt: Die Feldnamen stammen aus den
  Bibliotheken von Home Assistant, die echten Antworten können abweichen.
  Rückmeldungen willkommen.
- Keine Steuerung der Luftreiniger (Modus, Lüfterstufe): nur lesen, die
  Cloud-API der Luftreiniger ist nicht dokumentiert.
- Kindersicherung, Frostschutz und Fenstererkennung werden angezeigt, nicht
  geändert.
- Der Energieindex beginnt bei der ersten Messung und verpasst, was ein
  Heizkörper verbraucht, während die Integration gestoppt ist.
- Die alten Mill-Heizkörper (Gen 1, erste Mill-App) werden nicht unterstützt.
- Der lokale Modus braucht eine feste IP-Adresse: Gladys läuft in einem
  Container, der die Heizkörper im Netzwerk nicht finden kann.
