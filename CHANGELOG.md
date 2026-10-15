# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-15

### Added

- Mill heaters, sockets, Mill Sense sensors and air purifiers of the Mill
  account, through the Mill cloud.
- Mill Gen 3 heaters on the local network, through their local API, without
  Internet.
- Heaters and sockets: temperature, set-point, mode (off, individual
  set-point, weekly programme), heating now, power, energy of the day, an
  energy index for the energy monitoring, humidity (sockets), child lock, open
  window detected and frost protection (read only).
- Set-point and mode commands, from the dashboard and from scenes.
- Mill Sense: temperature, humidity, estimated CO2, TVOC, battery. Air
  purifiers: temperature, humidity, PM2.5, PM10 (read only).
- Scene trigger "Mill device offline" and scene action "Set every Mill heater
  to a mode".
- Dashboard widget "Mill heaters": every heater at a glance, total power, all
  off or back to the weekly programme.
- "Test the connection" button in the configuration.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-mill/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-mill/releases/tag/v1.0.1
