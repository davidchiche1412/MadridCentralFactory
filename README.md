# MadridCentralFactory

Caché de geocodificaciones para [MadridCentralChecker](../MadridCentralChecker). Guarda en Redis (RedisJSON) las coordenadas de cada dirección y si está dentro de la zona. Desplegado en Fly.io.

## Requisitos

- Node.js >= 24.22.3 (incluye los parches de seguridad de noviembre de 2026).
- Redis con el módulo RedisJSON.

## Puesta en marcha

```sh
cp .env.example .env   # y rellena las credenciales de Redis
npm ci
npm start
```

## Variables de entorno

| Variable | Descripción |
|---|---|
| `PORT` | Puerto (por defecto 3001) |
| `ALLOWED_ORIGINS` | Orígenes CORS permitidos, separados por comas y con `https://` |
| `REDIS_HOSTNAME`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` | Conexión a Redis |

## API

- `GET /?address=...`: devuelve `{lat, long, inside}` o 404 si no está en la caché.
- `POST /` con `{address, lat, long}`: guarda la dirección. **`inside` lo calcula el servidor**; si el cliente lo envía, se ignora. Una dirección ya guardada no se sobrescribe.
- `GET /health`: estado del servicio y de Redis (lo usa Fly.io).

Hay un límite de 60 peticiones por minuto y por IP, cuerpos de máximo 2 KB y direcciones de hasta 200 caracteres.

## Despliegue

```sh
fly deploy
fly secrets set REDIS_HOSTNAME=... REDIS_PORT=... REDIS_USERNAME=... REDIS_PASSWORD=... ALLOWED_ORIGINS=https://madridcentral.org
```

La imagen se basa en `node:26.13.1-bookworm-slim` y se ejecuta sin root.

## Nota

El polígono de la zona (`MADRID_CENTRAL` en `app.js`) debe coincidir con el del front. No se ha revisado si sigue vigente.