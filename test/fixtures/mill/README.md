# Mill fixtures

No Mill account nor heater was available to write this integration. These
answers are **reconstructed** from the field names read by the libraries of the
Home Assistant integration, not captured from a real account:

- `cloud-*.json`: the fields of `millheater` 0.15 (`Danielhiversen/pymill`,
  MIT) — `ownHouses`, `roomId`, `devices`, `items`, `deviceType.parentType.name`,
  `lastMetrics.*`, `deviceSettings.reported.*`, `energyUsageForCurrentDay`.
  `macAddress` and `roomName` are not read by millheater: they are assumptions.
- `local-status.json`, `local-control-status.json`: the keys of the Home
  Assistant tests of the local mode (`mill-local` 0.5.0).
- `local-control-status-extended.json`: the same, plus the optional keys
  (`humidity`, `lock_active`, `open_window_active_now`…) the integration reads
  when a heater sends them — not confirmed on a real heater.

Every id, MAC address and name is invented. `scripts/probe.mjs` checks the real
answers from a machine with network access.
