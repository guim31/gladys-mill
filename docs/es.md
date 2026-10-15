# Mill

Los radiadores, enchufes y sensores de aire Mill en Gladys, a través de la nube
Mill (la cuenta de la aplicación Mill) y, para los radiadores Gen 3 recientes,
a través de su API local en su red.

> **Desarrollada sin el hardware: sus comentarios son bienvenidos.** La
> integración se escribió a partir de las bibliotecas de código abierto de la
> integración de Home Assistant, sin cuenta Mill ni radiador Mill. Si algo le
> parece incorrecto, abra una incidencia en
> [GitHub](https://github.com/guim31/gladys-mill/issues).
>
> Esta integración no está afiliada a Mill International AS.

## Qué hace

- Encuentra todos los radiadores, enchufes, sensores Mill Sense y
  purificadores de aire de su cuenta Mill, y los radiadores Gen 3 que indique
  en la red local.
- Muestra la temperatura medida, la consigna, el modo, si el radiador está
  calentando, la potencia consumida y la energía del día.
- Permite cambiar la consigna y el modo (apagado, consigna individual,
  programa semanal) desde el panel y desde las escenas.
- Lleva un índice de energía para el seguimiento de energía de Gladys.
- Lanza una escena cuando un dispositivo Mill deja de responder.
- Ofrece un widget de panel con todos los radiadores de un vistazo.

## Requisitos

- Gladys 5.1.0 o posterior.
- Para la nube: la dirección de correo y la contraseña de la aplicación Mill
  (nube Mill Norway, la aplicación de los dispositivos Gen 2 y Gen 3).
- Para el modo local: un radiador Mill Gen 3 con la API local activada en la
  aplicación Mill, y una dirección IP fija (una reserva DHCP en su router).

Ambos pueden usarse juntos: la nube para los enchufes y los sensores, la API
local para los radiadores Gen 3.

## Configuración

1. En Gladys, abra **Integraciones → Mill** y rellene el formulario:
   - **Dirección de correo** y **Contraseña**: su cuenta Mill. Déjelas vacías
     para usar solo radiadores locales.
   - **Direcciones locales**: las direcciones IP de sus radiadores Gen 3,
     separadas por comas, por ejemplo `192.168.1.40, 192.168.1.41`.
   - **Actualización de la nube**: cada minuto (por defecto), cada 2 o 5
     minutos.
   - **Idioma de los nombres de funciones**: los nombres dados a las funciones
     cuando se añade un dispositivo (francés por defecto).
   - **Preferir la conexión local** (mostrado por Gladys): cuando un radiador
     Gen 3 está a la vez en su cuenta y en la red local, solo se ofrece su
     copia local en la pestaña Descubrimiento.
2. Pulse **Probar la conexión**: el resultado enumera los dispositivos de la
   nube y cada radiador local.
3. Abra la pestaña **Descubrimiento** y añada los dispositivos que desee.

Gladys guarda la contraseña en la configuración de la integración. La
integración guarda los tokens de sesión de Mill en su volumen `/data`, para no
volver a iniciar sesión en cada reinicio.

## Dispositivos

**Radiador y enchufe** (nube) — un dispositivo por dispositivo Mill:

| Función                   | Qué muestra                                                          |
| ------------------------- | -------------------------------------------------------------------- |
| Temperatura               | La temperatura medida por el radiador                                |
| Consigna                  | La temperatura objetivo, de 5 a 35 °C, en pasos de 0,5 °C            |
| Modo                      | Apagado, consigna individual, programa semanal                       |
| Calentando                | Si el radiador está calentando ahora mismo                           |
| Potencia                  | La potencia consumida, en W                                          |
| Energía de hoy            | La energía del día, en kWh (vuelve a 0 cada noche)                   |
| Índice de energía         | Un contador que solo crece, para el seguimiento de energía           |
| Humedad                   | Enchufes con sensor                                                  |
| Bloqueo infantil          | Solo lectura                                                         |
| Ventana abierta detectada | El radiador detectó una bajada brusca de temperatura (1 = detectada) |
| Antihielo                 | Solo lectura, cuando el radiador lo indica                           |

Cambiar la consigna pasa el radiador a consigna individual, como hace la
aplicación Mill: en programa semanal, el radiador sigue su programa, no la
consigna.

**Radiador Gen 3** (local) — temperatura, consigna, modo, calentando, potencia
y, cuando el radiador los envía, humedad, bloqueo infantil y ventana abierta.

**Mill Sense** (nube) — temperatura, humedad, CO2 estimado, COV totales,
batería.

**Purificador de aire** (nube) — temperatura, humedad, PM2.5 y PM10 cuando el
purificador los indica (solo lectura).

## Widget del panel

**Radiadores Mill** muestra todos los radiadores añadidos a Gladys:
temperatura medida, consigna y estado (calentando, inactivo, apagado, sin
conexión), la potencia total y el número de radiadores calentando. Dos botones
actúan sobre todos: **Todos: programa** (vuelta al programa semanal) y
**Apagar todos** (pide una confirmación). La consigna de cada radiador sigue
en los widgets de termostato de Gladys.

## Disparador y acción de escena

- Disparador **Dispositivo Mill sin conexión**: un dispositivo Mill dejó de
  responder — desenchufado, sin Wi-Fi o con el disyuntor saltado. Filtre por un
  dispositivo o deje el filtro vacío; la variable `device_name` contiene el
  nombre del dispositivo. Una caída de la propia nube Mill no lanza nada (los
  dispositivos se muestran «inaccesibles»).
- Acción **Poner todos los radiadores Mill en un modo**: programa semanal,
  consigna individual o apagado, para todos los radiadores y enchufes añadidos
  a Gladys. Sus salidas `changed` y `failed` cuentan los radiadores
  modificados y los que no respondieron.

## Ejemplos de escenas

- **Salir de casa**: cuando se va la última persona, lance «Poner todos los
  radiadores Mill en un modo» con **Apagado** — o con **Programa semanal** si
  el programa ya baja la temperatura.
- **Ventana abierta**: cuando se abre un sensor de apertura de la habitación,
  ponga el modo del radiador de esa habitación en **Apagado**; cuando se
  cierra, vuelva al **Programa semanal**.
- **Disyuntor saltado**: cuando se lance «Dispositivo Mill sin conexión», envíe
  un mensaje «{{device_name}} ya no responde».

## Actualización y cuotas

Gladys todavía no consulta de forma fiable los dispositivos externos, así que
la integración los actualiza por sí misma:

- la nube Mill cada minuto (o cada 2 o 5 minutos): dos peticiones por casa;
- cada radiador local cada 30 segundos.

Tras la primera búsqueda, solo se leen los dispositivos añadidos a Gladys. La
nube Mill limita las peticiones: cuando responde «demasiadas peticiones» (HTTP
429), la integración reduce su ritmo a la mitad, hasta una vez cada 30
minutos, hasta que vuelve a responder. Una contraseña rechazada detiene las
lecturas de la nube hasta que cambie la configuración, para que los intentos
repetidos no bloqueen la cuenta. Solo se envían a Gladys los valores que
cambian, y un valor sin cambios de nuevo cada 6 horas.

## Solución de problemas

- **«Cuenta Mill rechazada»**: compruebe la dirección de correo y la
  contraseña en la aplicación Mill y vuelva a guardar la configuración.
- **Un radiador local no responde**: compruebe que la API local está activada
  en la aplicación Mill, que el radiador conserva la misma dirección IP y que
  Gladys puede alcanzarlo (la integración se ejecuta en un contenedor en el
  servidor de Gladys).
- **Ningún valor en una función**: el dispositivo no lo indica (la función
  queda vacía), o está sin conexión.
- **Un radiador de la nube aparece «inaccesible»**: la nube Mill no responde,
  o el radiador está desconectado de la nube.
- Los registros de la integración solo muestran su ciclo de vida (inicio,
  conexión, dispositivo perdido y recuperado, errores, sus acciones). La
  variable de entorno `LOG_LEVEL=debug` muestra cada actualización.

## Limitaciones

- Desarrollada sin dispositivo ni cuenta Mill: los nombres de los campos
  vienen de las bibliotecas de Home Assistant, las respuestas reales pueden
  diferir. Sus comentarios son bienvenidos.
- Sin control de los purificadores de aire (modo, velocidad): solo lectura, la
  API en la nube de los purificadores no está documentada.
- El bloqueo infantil, el antihielo y la detección de ventana abierta se
  muestran, no se modifican.
- El índice de energía empieza en la primera lectura y no cuenta lo que un
  radiador consume mientras la integración está detenida.
- Los radiadores Mill antiguos (Gen 1, primera aplicación Mill) no son
  compatibles.
- El modo local necesita una dirección IP fija: Gladys se ejecuta en un
  contenedor que no puede descubrir los radiadores en la red.
