// -----------------------------------------------------------------------------
// Values of the Gladys core the SDK does not export (server/utils/constants.js
// of Gladys 5.2.1). They are stored in device states and in users' scenes:
// they never change meaning.
// -----------------------------------------------------------------------------

export const THERMOSTAT_MODE = {
  OFF: 0,
  HEATING: 1,
  COOLING: 2,
  AUTO: 3,
};

export const THERMOSTAT_OPERATING_STATE = {
  IDLE: 0,
  HEATING: 1,
};
