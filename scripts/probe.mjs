#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe the real Mill APIs with the integration's own clients, read only,
// without printing anything sensitive (no password, no token, no MAC address,
// no device name).
//
//   node scripts/probe.mjs
//       Signs in to the Mill cloud with a made-up account and checks that the
//       refusal is understood (MillAuthError). Proves the endpoint, the payload
//       and the refusal format.
//
//   MILL_USERNAME=... MILL_PASSWORD=... node scripts/probe.mjs
//       Signs in with a real account and lists what the integration would see:
//       device kinds, models, and which values each one reports (keys only).
//       Changes nothing.
//
//   node scripts/probe.mjs <ip>
//       Reads GET /status and GET /control-status of a Gen 3 heater on the LAN
//       and prints the keys and the value types, plus the snapshot the
//       integration builds. Sends no command.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { MillCloud } from '../src/mill/cloud.js';
import { MillLocal } from '../src/mill/local.js';
import { fromCloud, fromLocal } from '../src/model.js';

const shape = (object) =>
  Object.fromEntries(
    Object.entries(object ?? {}).map(([key, value]) => [
      key,
      value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
    ]),
  );

async function probeFakeAccount() {
  const cloud = new MillCloud({
    username: `probe-${randomUUID()}@example.com`,
    password: randomUUID(),
  });
  try {
    await cloud.connect();
    console.log('UNEXPECTED: a made-up account was accepted');
    process.exitCode = 1;
  } catch (err) {
    if (err.name === 'MillAuthError') {
      console.log(`OK: the made-up account was refused (${err.message})`);
    } else {
      console.log(`UNEXPECTED: no account refusal, ${err.name} (${err.message})`);
      process.exitCode = 1;
    }
  }
}

async function probeRealAccount(username, password) {
  const cloud = new MillCloud({ username, password });
  const entries = await cloud.listDevices();
  console.log(
    `Signed in. ${entries.length} device(s) in ${(await cloud.listHouses()).length} house(s).`,
  );
  entries.forEach(({ device, room }, index) => {
    const snapshot = fromCloud({ device, room });
    console.log(
      `\n#${index + 1} ${device.deviceType?.parentType?.name} / ${device.deviceType?.childType?.name}`,
    );
    console.log(`  in a room: ${Boolean(room)}, connected: ${device.isConnected}`);
    console.log(`  device keys: ${Object.keys(device).join(', ')}`);
    console.log(`  lastMetrics: ${JSON.stringify(shape(device.lastMetrics))}`);
    console.log(`  reported settings: ${JSON.stringify(shape(device.deviceSettings?.reported))}`);
    console.log(
      snapshot
        ? `  integration: ${snapshot.kind}, values ${JSON.stringify(snapshot.values)}`
        : '  integration: unsupported type, left out',
    );
  });
}

async function probeLocal(host) {
  const heater = new MillLocal(host);
  const status = await heater.status();
  const control = await heater.controlStatus();
  console.log(`/status keys: ${JSON.stringify(shape(status))}`);
  console.log(`  firmware: ${status.version}`);
  console.log(`/control-status: ${JSON.stringify(shape(control))}`);
  console.log(`  operation_mode: ${control.operation_mode}`);
  const snapshot = fromLocal(status, control);
  console.log(`integration values: ${JSON.stringify(snapshot.values)}`);
}

const [arg] = process.argv.slice(2);
try {
  if (arg) {
    await probeLocal(arg);
  } else if (process.env.MILL_USERNAME && process.env.MILL_PASSWORD) {
    await probeRealAccount(process.env.MILL_USERNAME, process.env.MILL_PASSWORD);
  } else {
    await probeFakeAccount();
  }
} catch (err) {
  console.log(`Probe failed: ${err.name}: ${err.message}`);
  process.exitCode = 1;
}
