# WhatsApp

## Presentación

Hable con Gladys por WhatsApp, con la API oficial **WhatsApp Business Cloud** de Meta. Cada usuario de Gladys vincula su número de WhatsApp; sus mensajes llegan a Gladys, que le responde por WhatsApp y le envía allí sus notificaciones. Las escenas pueden reaccionar a los mensajes recibidos (botones de plantillas, ubicaciones…) y enviar plantillas de mensaje aprobadas.

La integración usa la nube de Meta (`graph.facebook.com`): los textos intercambiados con Gladys salen de su red local. Para recibir mensajes hace falta **Gladys Plus**, que proporciona a Meta una dirección HTTPS pública; sin él, Gladys solo puede enviar.

## Requisitos

- Gladys Assistant 5.3.0 o posterior.
- Una [aplicación de Meta](https://developers.facebook.com/apps) de tipo Empresa, con el producto **WhatsApp**, y un número de empresa. El número de prueba que ofrece Meta también funciona, pero solo llega a los 5 números registrados en WhatsApp → Configuración de la API.
- Un **usuario del sistema** (Configuración del negocio → Usuarios → Usuarios del sistema) que tenga la aplicación y la cuenta de WhatsApp, con un token **sin caducidad** y los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. El token temporal de la página de configuración de la API caduca a las 24 horas.
- Gladys Plus, para recibir mensajes.
- Meta factura los mensajes de una empresa según su tarifa (sobre todo las plantillas enviadas fuera de la ventana de 24 horas).

## Configuración

| Campo                                           | Qué introducir                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Identificador del número de teléfono            | El identificador que aparece en WhatsApp → Configuración de la API (no el número)            |
| Token de acceso                                 | El token permanente del usuario del sistema                                                  |
| Identificador de la cuenta de WhatsApp Business | Opcional: permite a la integración registrar su webhook en Meta y listar sus plantillas      |
| Token de verificación                           | Déjelo vacío: la integración lo genera; péguelo en Meta                                      |
| Registrar el webhook                            | Activado por defecto: el webhook de la cuenta sigue la URL de Gladys Plus                    |
| Plantilla de respaldo                           | Nombre de una plantilla aprobada con una variable en el cuerpo, p. ej. `gladys_notification` |
| Idioma de la plantilla                          | Su código de idioma, como en WhatsApp Manager: `en_US`, `fr`, `de`, `es`…                    |
| Marcar los mensajes recibidos como leídos       | Checks azules para el remitente                                                              |
| Idioma de las respuestas                        | Idioma de las respuestas enviadas antes de vincular un número                                |

**Recibir mensajes**: en el bloque **Webhooks de Gladys Plus**, guarde su clave Open API (Gladys Plus → Ajustes → Open API). Aparece entonces la URL del webhook. En la aplicación de Meta, abra WhatsApp → Configuración, pegue esta URL como **URL de devolución de llamada** y el token de verificación de la integración como **Token de verificación**, y suscríbase al campo **messages**. Si el identificador de la cuenta de WhatsApp Business está indicado, la integración también dirige por sí misma el webhook de la cuenta a esta URL, y de nuevo cada vez que cambia (el botón **Registrar el webhook** lo hace a petición).

**La ventana de 24 horas**: WhatsApp solo permite a una empresa enviar texto libre en las 24 horas siguientes al último mensaje del usuario. Cree una plantilla en WhatsApp Manager (categoría Utilidad, una variable en el cuerpo, por ejemplo `Gladys: {{1}}`), espere a que se apruebe e indique su nombre: fuera de la ventana, Gladys envía sus mensajes con ella. Sin ella, Meta rechaza esos mensajes.

## Uso

**Vincular su número**: en la pantalla de configuración, **Vincular mi cuenta** → genere un código y envíelo por WhatsApp al número de empresa, en menos de 15 minutos. Gladys responde que su cuenta está vinculada. Después escriba a Gladys como en el chat de Gladys.

Sin Gladys Plus, use el botón **Vincular un número sin Gladys Plus**: introduzca su número (formato internacional) y el código. Gladys le enviará entonces sus notificaciones con la plantilla de respaldo; sus mensajes no llegan a Gladys.

Los mensajes de texto, los botones pulsados y los pies de foto van a Gladys. Las notas de voz, los stickers y otros medios reciben la respuesta «Por ahora Gladys solo lee mensajes de texto». Los mensajes de números no vinculados se ignoran sin respuesta.

**Widget del panel**: el widget **WhatsApp** muestra el nombre verificado del número, su calificación de calidad y su límite de envío, los mensajes enviados, recibidos y fallidos desde medianoche (UTC), el estado del número en Meta, el estado de la recepción, el último evento de Meta y el número de contactos vinculados.

![El widget de WhatsApp (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-whatsapp/main/docs/assets/widgets.es.png)

**Escenas**:

- Disparador **Mensaje de WhatsApp recibido**: filtros por tipo de mensaje, carga útil de un botón, texto exacto. Variables: `from`, `contact_name`, `user`, `message_type`, `text`, `payload`, `latitude`, `longitude`, `emoji`, `message_id`.
- Disparador **Mensaje de WhatsApp no entregado**: el primer fallo para un número, y de nuevo solo después de que un mensaje haya pasado (una escena que le avisa por WhatsApp no puede entrar en bucle). Variables: `to`, `reason`, `error_code`, `error_title`, `message_id`.
- Acción **Enviar una plantilla de WhatsApp**: destinatario (vacío: todos los contactos vinculados), nombre de la plantilla, idioma, parámetros del cuerpo separados por `|` (o `nombre=valor` para los parámetros con nombre). Las variables de escena funcionan en todos los campos.

Ejemplos: cuando se pulsa el botón de plantilla con la carga útil `OPEN_GATE` → abrir el portón; cuando salta la alarma → enviar la plantilla `alerta_alarma` a todos; cuando un mensaje no se entrega por el token → enviar un correo.

## Solución de problemas

- **Probar la conexión** muestra el nombre, la calidad y el estado del número, y si la recepción funciona.
- **«Meta ha rechazado el token de acceso»**: el token ha caducado (token temporal) o se ha revocado. Genere un token permanente para el usuario del sistema.
- **No llega nada a Gladys**: compruebe que Gladys Plus está vinculado, que la clave Open API está guardada, que la URL y el token de verificación están pegados en Meta y que el campo **messages** está suscrito. El widget muestra «esperando a Meta» hasta el primer evento.
- **Mensaje no entregado, fuera de la ventana (131047)**: configure una plantilla de respaldo aprobada.
- **Número no permitido (131030)**: con el número de prueba de Meta, añada el destinatario en WhatsApp → Configuración de la API.
- **Plantilla rechazada (132000, 132001)**: compruebe el nombre, el código de idioma y el número de parámetros.
- Pulse **Diagnóstico** y copie las líneas que empiezan por «WhatsApp diagnostic» de la pestaña Registros en una [issue de GitHub](https://github.com/William-De71/gladys-whatsapp/issues): el token, la clave Open API y los números se omiten o se enmascaran.
