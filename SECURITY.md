# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes, in
particular:

- the Mill account: the password is stored by Gladys in the configuration of
  the integration and only sent to the Mill cloud (`api.millnorwaycloud.com`,
  HTTPS) to sign in;
- `/data/mill.json`, the only file the integration writes: the Mill session
  tokens (id token and refresh token, tied to a hash of the account e-mail,
  never the e-mail or the password) and the energy index of each heater;
- the local API of the Gen 3 heaters: plain HTTP without authentication on the
  LAN, as Mill designed it — the integration only talks to the addresses the
  user entered, and sends set-points and modes, nothing else;
- the logs: they must never contain the password, a token or a response body.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the Mill cloud, the Mill app and the firmware of the Mill devices.
