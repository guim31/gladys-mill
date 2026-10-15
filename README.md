# Mill for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for the **Mill
heaters, sockets and air sensors**, through the Mill cloud (the account of the
Mill app) and, for the recent **Gen 3 heaters**, their **local API**.

> **Developed without the hardware: feedback welcome.** No Mill account nor
> Mill device was available: the integration follows the open-source libraries
> of the Home Assistant integration, and its tests run against answers
> reconstructed from them. Please report what your devices really do in the
> [issues](https://github.com/guim31/gladys-mill/issues).

This project is not affiliated with Mill International AS. Mill is a trademark
of its owner.

## What it does

- **Discovery** of every heater, socket, Mill Sense sensor and air purifier of
  the Mill account, and of the Gen 3 heaters whose IP address is given.
- **Heaters and sockets**: measured temperature, set-point (5 to 35 °C), mode
  (off / individual set-point / weekly programme), heating now, power (W),
  energy of the day (kWh), an energy index for the Gladys energy monitoring,
  humidity (sockets), child lock, open window detected, frost protection.
- **Commands**: set-point and mode, from the dashboard and from scenes.
- **Mill Sense**: temperature, humidity, estimated CO2, TVOC, battery.
- **Air purifiers**: temperature, humidity, PM2.5, PM10 (read only).
- **Scene trigger** `device_offline`: a Mill device stopped answering.
- **Scene action** `set_mode_all`: one mode for every heater at once.
- **Dashboard widget** `overview`: every heater at a glance, total power, all
  off / back to the weekly programme.
- Texts in English, French, German and Spanish.

The user documentation, re-hosted by Gladys: [English](docs/en.md),
[français](docs/fr.md), [Deutsch](docs/de.md), [español](docs/es.md).

## Requirements

- Gladys **5.1.0** or later.
- A Mill account (Mill app, Gen 2 and Gen 3 devices), and/or a Mill Gen 3
  heater with the local API enabled in the Mill app and a fixed IP address.

## Installation

In Gladys: **Integrations → Install from GitHub**, then
`https://github.com/guim31/gladys-mill`. Fill in the Mill account and/or the
local addresses, click **Test the connection**, then add the devices from the
**Discovery** tab.

## How it works

- **Cloud** (`api.millnorwaycloud.com`, the API of the Mill app): sign-in with
  the account, id token refreshed with the refresh token (both kept in
  `/data`), houses → rooms → devices, settings changed by
  `PATCH devices/<id>/settings`.
- **Local** (Gen 3): `GET /status`, `GET /control-status`,
  `POST /set-temperature`, `POST /operation-mode` on the heater, plain HTTP on
  the LAN.
- **Refresh**: the integration refreshes by itself (Gladys does not poll
  external devices reliably yet, GladysAssistant/Gladys#3198): the cloud every
  1, 2 or 5 minutes, the local heaters every 30 s. Only the devices added to
  Gladys are read, only the changed values are published (plus a heartbeat
  every 6 h). A 429 of the Mill cloud slows the pace down, a refused password
  stops the cloud reads until the configuration changes.
- **Transports**: `cloud` and `local`, both real modes — the cloud is the only
  way to the sockets, sensors and older heaters, the local API works without
  Internet for the Gen 3 heaters. With "Prefer the local connection", a Gen 3
  heater found both ways is offered once, as its local device.

## Limits

- Field names and units come from the libraries, not from captured answers:
  `scripts/probe.mjs` checks them against the real APIs.
- No control of the air purifiers (mode, fan speed): their API is not
  documented in the libraries, they are read only.
- Child lock, frost protection and open window detection are read only.
- The energy index is counted by the integration from the energy of the day:
  it misses what is consumed while the integration is stopped.
- Gen 1 heaters (first Mill app) are not supported.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store . --skip-image-check
```

`node scripts/probe.mjs` signs in to the real Mill cloud with a made-up account
and checks the refusal; with `MILL_USERNAME`/`MILL_PASSWORD` it lists what a
real account returns (keys and types only); `node scripts/probe.mjs <ip>`
reads a Gen 3 heater. All three are read only and print nothing sensitive.

Releases go through the **Release** workflow (Actions → Release): it bumps the
version in `package.json` and the manifest, rolls the changelog, tags, builds
the multi-arch image and publishes the GitHub Release.

## Credits

- [`millheater`](https://github.com/Danielhiversen/pymill) and
  [`mill-local`](https://pypi.org/project/mill-local/) by Daniel Hjelseth
  Høyer (MIT), and the
  [Home Assistant Mill integration](https://www.home-assistant.io/integrations/mill)
  (Apache 2.0): the description of both APIs.
- [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
  and the official integration template.

## License

[Apache-2.0](LICENSE)
