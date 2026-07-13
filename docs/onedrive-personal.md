# OneDrive personal para facturas

El dashboard puede leer automaticamente facturas de una carpeta aislada de OneDrive personal. No necesita la contrasena de Microsoft y no obtiene acceso al resto del OneDrive.

## 1. Registrar la aplicacion en Microsoft

1. Entra en Microsoft Entra admin center con la cuenta que administrara la aplicacion.
2. Crea un registro de aplicacion llamado `Apolo Dashboard`.
3. En tipos de cuenta, selecciona cuentas de cualquier directorio y cuentas personales de Microsoft.
4. Anade una plataforma Web con esta URL de redireccion exacta:

   `https://apolodashbprueba.vercel.app/api/onedrive/oauth/callback`

5. En permisos de Microsoft Graph, anade los permisos delegados:

   - `Files.ReadWrite.AppFolder`
   - `offline_access`

6. Crea un secreto de cliente y guarda su valor en Vercel. No lo escribas en el codigo ni lo envies por chat.

## 2. Variables de Vercel

Configura estas variables en Production, Preview y Development:

- `MICROSOFT_OAUTH_CLIENT_ID`: identificador de la aplicacion.
- `MICROSOFT_OAUTH_CLIENT_SECRET`: valor del secreto de cliente.
- `MICROSOFT_OAUTH_REDIRECT_URI`: `https://apolodashbprueba.vercel.app/api/onedrive/oauth/callback`.
- `ONEDRIVE_TOKEN_ENCRYPTION_KEY`: clave aleatoria de 32 bytes en base64.
- `CRON_SECRET`: secreto aleatorio para proteger la tarea automatica.

Genera las dos claves aleatorias en un terminal local:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Usa una salida distinta para cada variable y vuelve a desplegar el proyecto.

## 3. Autorizar y usar

1. Entra en `Despeses`.
2. Pulsa `Conectar OneDrive` y acepta el permiso de Microsoft.
3. Microsoft creara la carpeta privada de la aplicacion y dentro `Facturas pendientes`.
4. Sube PDF, JPG, JPEG, PNG o WEBP. Las subcarpetas tambien se leen.
5. Pulsa `Processar ara` para una prueba inmediata. Despues, Vercel ejecutara la lectura cada 30 minutos.

Las carpetas llamadas `Procesadas`, `Processades`, `No facturas`, `No-facturas`, `Archivadas` o `Arxivades` se ignoran. Los documentos duplicados tambien se ignoran por su contenido.

## Seguridad

- El permiso se limita a la carpeta privada de la aplicacion.
- El token renovable se cifra con AES-256-GCM antes de guardarse en Neon.
- Desconectar OneDrive borra el permiso guardado del dashboard, pero conserva las facturas ya importadas.
- El flujo no escribe en tablas del POS, ventas, catalogo, Cashlogy ni Comercia.
