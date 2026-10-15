# Mill

Mill heaters, sockets and air sensors in Gladys, through the Mill cloud (the
account of the Mill app) and, for the recent Gen 3 heaters, through their local
API on your network.

> **Developed without the hardware: feedback welcome.** The integration was
> written from the open-source libraries of the Home Assistant integration,
> without a Mill account nor a Mill heater. If something looks wrong, open an
> issue on [GitHub](https://github.com/guim31/gladys-mill/issues).
>
> This integration is not affiliated with Mill International AS.

## What it does

- Finds every Mill heater, socket, Mill Sense sensor and air purifier of your
  Mill account, and the Gen 3 heaters you list on the local network.
- Shows the measured temperature, the set-point, the mode, whether the heater
  is heating, the power drawn and the energy of the day.
- Lets you change the set-point and the mode (off, individual set-point,
  weekly programme) from the dashboard and from scenes.
- Counts an energy index for the Gladys energy monitoring.
- Fires a scene trigger when a Mill device goes offline.
- Offers a dashboard widget with every heater at a glance.

## Requirements

- Gladys 5.1.0 or later.
- For the cloud: the e-mail address and the password of the Mill app (Mill
  Norway cloud, the app of the Gen 2 and Gen 3 devices).
- For the local mode: a Mill Gen 3 heater with the local API enabled in the
  Mill app, and a fixed IP address for it (a DHCP reservation in your router).

The two can be used together: the cloud for the sockets and sensors, the local
API for the Gen 3 heaters.

## Configuration

1. In Gladys, open **Integrations → Mill** and fill in the form:
   - **E-mail address** and **Password**: your Mill account. Leave them empty
     to use only local heaters.
   - **Local addresses**: the IP addresses of your Gen 3 heaters, separated by
     commas, e.g. `192.168.1.40, 192.168.1.41`.
   - **Cloud refresh**: every minute (default), 2 or 5 minutes.
   - **Language of the feature names**: the names given to the features when a
     device is added (French by default).
   - **Prefer the local connection** (shown by Gladys): when a Gen 3 heater is
     both in your account and on the local network, only its local copy is
     offered in the Discovery tab.
2. Click **Test the connection**: the result lists the cloud devices and each
   local heater.
3. Open the **Discovery** tab and add the devices you want.

The password is stored by Gladys in the configuration of the integration. The
integration keeps the Mill session tokens in its `/data` volume, so a restart
does not sign in again.

## Devices

**Heater and socket** (cloud) — one device per Mill device:

| Feature              | What it shows                                                   |
| -------------------- | --------------------------------------------------------------- |
| Temperature          | The temperature measured by the heater                          |
| Set-point            | The target temperature, 5 to 35 °C, by steps of 0.5 °C          |
| Mode                 | Off, individual set-point, weekly programme                     |
| Heating              | Whether the heater is heating right now                         |
| Power                | The power drawn, in W                                           |
| Energy today         | The energy of the day, in kWh (back to 0 every night)           |
| Energy index         | A counter that only grows, for the energy monitoring            |
| Humidity             | Sockets with a sensor                                           |
| Child lock           | Read only                                                       |
| Open window detected | The heater detected a sudden drop of temperature (1 = detected) |
| Frost protection     | Read only, when the heater reports it                           |

Changing the set-point switches the heater to the individual set-point mode,
as the Mill app does: in the weekly programme, the heater follows its
programme, not the set-point.

**Gen 3 heater** (local) — temperature, set-point, mode, heating, power, and,
when the heater sends them, humidity, child lock and open window.

**Mill Sense** (cloud) — temperature, humidity, estimated CO2, TVOC, battery.

**Air purifier** (cloud) — temperature, humidity, PM2.5 and PM10 when the
purifier reports them (read only).

## Dashboard widget

**Mill heaters** shows every heater added to Gladys: measured temperature,
set-point and state (heating, idle, off, offline), the total power and the
number of heaters heating. Two buttons act on all of them: **All: programme**
(back to the weekly programme) and **All off** (asks for a confirmation). The
set-point of each heater stays on the Gladys thermostat widgets.

## Scene trigger and action

- Trigger **Mill device offline**: a Mill device stopped answering — unplugged,
  out of Wi-Fi, or a tripped breaker. Filter on one device or leave the filter
  empty; the variable `device_name` holds the name of the device. An outage of
  the Mill cloud itself fires nothing (the devices show "unreachable").
- Action **Set every Mill heater to a mode**: weekly programme, individual
  set-point or off, for every heater and socket added to Gladys. Its outputs
  `changed` and `failed` count the heaters changed and those that did not
  answer.

## Scene examples

- **Leaving home**: when the last person leaves, run "Set every Mill heater to
  a mode" with **Off** — or with **Weekly programme** if the programme already
  lowers the temperature.
- **Window opened**: when a door or window sensor of the room opens, set the
  mode of the heater of that room to **Off**; when it closes, back to
  **Weekly programme**.
- **Breaker tripped**: when "Mill device offline" fires, send a message
  "{{device_name}} no longer answers".

## Refresh and quotas

Gladys does not poll external devices reliably yet, so the integration
refreshes them itself:

- the Mill cloud every minute (or 2, or 5 minutes): two requests per house;
- each local heater every 30 seconds.

After the first search, only the devices added to Gladys are read. The Mill
cloud limits the requests: when it answers "too many requests" (HTTP 429), the
integration halves its pace, up to once every 30 minutes, until it answers
again. A refused password stops the cloud reads until you change the
configuration, so the account is not locked by repeated attempts. Only the
values that changed are sent to Gladys, and an unchanged value again every
6 hours.

## Troubleshooting

- **"Mill account refused"**: check the e-mail address and the password in the
  Mill app, then save the configuration again.
- **A local heater does not answer**: check that the local API is enabled in
  the Mill app, that the heater keeps the same IP address, and that Gladys can
  reach it (the integration runs in a container on the Gladys server).
- **No value on a feature**: the device does not report it (the feature then
  stays empty), or it is offline.
- **A cloud heater shows "unreachable"**: the Mill cloud does not answer, or the
  heater is disconnected from the cloud.
- The logs of the integration only show its lifecycle (start, connection, a
  device lost and back, errors, your actions). The environment variable
  `LOG_LEVEL=debug` shows every refresh.

## Limits

- Developed without a Mill device nor account: the field names come from the
  Home Assistant libraries, the real answers may differ. Feedback welcome.
- No air purifier control (mode, fan speed): read only, the Mill cloud API of
  the purifiers is not documented.
- The child lock, the frost protection and the open window detection are shown,
  not changed.
- The energy index starts at the first reading, and misses what a heater
  consumes while the integration is stopped.
- The old Mill heaters (Gen 1, the first Mill app) are not supported.
- The local mode needs a fixed IP address: Gladys runs in a container that
  cannot discover the heaters on the network.
