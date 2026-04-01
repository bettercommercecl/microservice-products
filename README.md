# microservice-products

Microservicio **AdonisJS 6** que centraliza el **catálogo de productos** sincronizado desde **BigCommerce**, su persistencia en **PostgreSQL** (con réplica de lectura opcional), caché opcional en **Redis**, y exposición de APIs para consumo por storefronts y jobs de sincronización.

Cada despliegue suele estar **acotado a un país** (`COUNTRY_CODE` en entorno): la misma base de código sirve varios países con archivos `.env` distintos (por ejemplo `dev:colombia`, `dev:chile`).

---

## Qué hace este repositorio

| Área | Rol |
|------|-----|
| **Sincronización** | Descarga y normaliza marcas, categorías, productos, variantes, opciones, packs, stock e inventario seguro desde BigCommerce y los escribe en tablas locales. |
| **Lectura de catálogo** | Expone listados y detalle paginados por producto, variante, canal, categoría, etc., para integraciones machine-to-machine. |
| **Canales / marcas** | Modela la relación producto–canal (`channel_product`), configuración por marca y país (`channels`, `app/utils/channels/channels.ts`). |
| **Post-sync** | Tras ciertos syncs, puede notificar a las APIs de cada marca vía HTTP (`SyncWebhookNotifier`), con URL derivada de la config de canales y cabecera `x-api-key`. |

Detalle de flujos de sync y versionado: [`docs/sync_flows_and_api.md`](docs/sync_flows_and_api.md).

---

## Stack

- **Runtime:** Node.js, **TypeScript**
- **Framework:** AdonisJS 6
- **Base de datos:** PostgreSQL (Lucid ORM)
- **Integración catálogo:** BigCommerce API
- **Autenticación API:** middleware `m2mAuth` (machine-to-machine) en la mayoría de rutas bajo `api/`
- **Tests:** Japa (`node ace test`)

---

## Arquitectura y capas

La organización sigue una **separación por responsabilidades** alineada con **puertos y adaptadores** (hexagonal), sin ser estrictamente DDD.

```
app/
├── presentation/          # Capa HTTP: controladores, middlewares, validadores (Vine)
├── services/              # Casos de uso de aplicación y orquestación (sync, productos, etc.)
├── application/           # Casos de uso puntuales, formatters, puertos de aplicación
│   ├── use_cases/
│   └── ports/             # Interfaces (repositorios, cálculo, etc.)
├── infrastructure/        # Implementaciones: Lucid, repositorios, adaptadores BigCommerce
├── ports/                 # Puertos transversales (p. ej. catálogo, caché) registrados en providers
└── utils/                 # Config estática de canales por marca/país (`channels/channels.ts`)
config/                    # sync.ts, database, etc.
start/                     # routes/, env, kernel (middlewares)
providers/                 # Registro de servicios (BigCommerce, caché, sync)
```

| Capa | Contenido típico |
|------|-------------------|
| **Presentación** | `app/presentation/controllers/**` — reciben HTTP, validan, llaman servicios o casos de uso. |
| **Aplicación** | `app/application/use_cases/**`, `app/application/ports/**` — contratos y flujos que no dependen de HTTP. |
| **Dominio / servicios** | `app/services/**` — lógica de negocio y orquestación (p. ej. `GlobalProductSyncService`, `VariantService`). |
| **Infraestructura** | `app/infrastructure/persistence/**`, `app/infrastructure/bigcommerce/**` — acceso a DB y APIs externas. |
| **Modelos** | `app/infrastructure/persistence/lucid/**` — modelos Lucid (`Product`, `Variant`, `Channel`, …). |

**Imports con alias** (ver `package.json` `imports`): `#controllers/*`, `#services/*`, `#models/*`, `#config/*`, `#start/*`, `#application/*`, `#infrastructure/*`, etc.

---

## Comportamiento general

1. **Un proceso = un país** en la práctica: variables como `COUNTRY_CODE`, moneda, IDs de categorías BigCommerce y price lists se leen de `start/env.ts` y `.env`.
2. **Dos modos de sync de productos** (mismo formateo global en gran parte):
   - **Por canal:** solo catálogo asociado a un canal BigCommerce concreto; requiere fila en `channels` y config en `channels.ts` para ese nombre + país.
   - **Global:** catálogo completo del store según el país.
3. **Lecturas** de API suelen ir con **réplica** si está configurada (`readCommitted` en rutas sensibles como variantes).
4. **Rate limiting** por IP o clave global según ruta (sync más restrictivo).

---

## Rutas HTTP

Prefijo base de las APIs de negocio: **`/api`** (salvo la raíz `/`).

### Raíz

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Health mínimo (`hello: world`). |
| GET | `/favicon.ico` | Respuesta vacía 204 para evitar ruido en logs. |

### Catálogo y consultas (autenticación `m2mAuth`, rate limit por IP salvo indicación)

#### Productos — `start/routes/products.ts`

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET | `/api/products` | Listado de productos. |
| GET | `/api/products/reviews/paginated` | Reviews paginadas. |
| GET | `/api/products/paginated` | Productos paginados. |
| GET | `/api/products/by-channel` | Productos filtrados por canal. |
| GET | `/api/products/:id` | Detalle de un producto por ID. |
| GET | `/api/sync-stats/:channel_id` | Estadísticas de sync para un canal (conteos, última sync, nombre de canal). |

#### Variantes — `start/routes/variants.ts`

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET | `/api/variants` | Listado de variantes. Usa aislamiento de lectura `readCommitted`. |
| GET | `/api/variants/paginated` | Variantes paginadas; post-proceso (p. ej. filtro por talla/color y mayor stock por producto donde aplica). |
| GET | `/api/variants/by-channel` | Variantes asociadas a un canal. |
| POST | `/api/variants/formatted-by-ids` | Body con IDs; devuelve variantes ya formateadas para consumo externo. |

#### Packs — `start/routes/packs.ts`

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET | `/api/packs/paginated` | Packs paginados. |
| GET | `/api/packs/by-channel` | Packs por canal. |

#### Opciones — `start/routes/options.ts`

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET | `/api/options/paginated` | Opciones de producto paginadas. |
| GET | `/api/options/by-channel` | Opciones por canal. |

#### Category products — `start/routes/category_products.ts`

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET | `/api/category-products/paginated` | Relaciones categoría–producto paginadas. |
| GET | `/api/category-products/by-channel` | Mismo concepto filtrado por canal. |

#### Marcas y categorías — `start/routes/brands.ts`, `categories.ts`

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET | `/api/brands` | Listado de marcas. |
| GET | `/api/brands/:id` | Detalle de marca. |
| GET | `/api/categories` | Listado de categorías. |
| GET | `/api/categories/:id` | Detalle de categoría. |

#### Canales — `start/routes/channels.ts`

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET | `/api/channels` | Todos los canales. |
| GET | `/api/channels/with-products` | Canales que tienen productos asignados. |
| GET | `/api/channels/by-country` | Agrupación por país (útil para revisar config multi-marca). |
| GET | `/api/channels/name/:name` | Canal por nombre (formato validado, p. ej. `MARCA_PAIS`). |
| GET | `/api/channels/:id` | Detalle por ID numérico. |
| POST | `/api/channels` | Alta de canal. |
| PUT | `/api/channels/:id` | Actualización. |
| DELETE | `/api/channels/:id` | Baja. |

#### Inventario seguro — `start/routes/catalog_safe_stocks.ts`

| Método | Ruta | Propósito |
|--------|------|-----------|
| GET | `/api/catalog-safe-stocks` | Stock seguro paginado (tabla `catalog_safe_stock` / modelo `CatalogSafeStock`). |

---

### Sincronización

#### Legacy / por nombre en español — `start/routes/sync.ts`

Rutas pensadas para jobs o operación manual. **Rate limit global** por endpoint. El grupo **no** aplica `m2mAuth` en el código actual (el middleware está comentado): revisar seguridad en despliegue (red privada, API gateway, etc.).

| Método | Ruta | Controlador | Propósito |
|--------|------|-------------|-----------|
| GET | `/api/sincronizar-productos/:channel_id` | `SyncController` v1 | Sync de **productos por canal** (`channel_id` numérico o nombre). |
| GET | `/api/sincronizar-categorias` | idem | Sync de categorías desde BigCommerce. |
| GET | `/api/sincronizar-marcas` | idem | Sync de marcas. |
| GET | `/api/sincronizar-canales` | idem | Upsert de filas `channels` desde `app/utils/channels/channels.ts` (incluye webhook URL/secret según env). |

#### Sync v2 bajo `/api/sync` — `start/routes/product_sync.ts`

Protegidas con **`m2mAuth`**. Orquestación global del catálogo para el país actual.

| Método | Ruta | Controlador | Propósito |
|--------|------|-------------|-----------|
| GET | `/api/sync/completo` | `FullSyncController` | Pipeline completo: marcas → categorías → productos → packs → packs reserva (y evento de webhook al final). Rate limit muy restrictivo (ventana larga). |
| GET | `/api/sync/canales` | `SyncControllerV2` | Igual que sincronizar canales pero bajo prefijo `/api/sync`. |
| GET | `/api/sync/productos` | idem | Sync global de productos. |
| GET | `/api/sync/packs` | idem | Sync de packs. |
| GET | `/api/sync/packs-reserva` | idem | Packs de reserva. |
| GET | `/api/sync/stock` | idem | Sincronización de stock. |

Los controladores v1 y v2 delegan en **`GlobalProductSyncService`** y servicios de sincronización compartidos; la diferencia principal es **canal vs global**, descrita en la documentación enlazada arriba.

---

## Configuración imprescindible (referencia)

- **Entorno:** `start/env.ts` define y valida variables; cada país tiene típicamente su `.env` (o copias tipo `.env.colombia`).
- **Canales por marca/país:** `app/utils/channels/channels.ts` — `CHANNEL`, `API_URL`, `PARENT_CATEGORY`, métodos de envío, etc.
- **Sync:** `config/sync.ts` — lotes, TTL de caché, path de webhook `webhookSyncProductsPath`.
- **Webhooks post-sync:** claves `API_KEY_BRANDS` / alias, `SYNC_WEBHOOKS_*`, `SYNC_WEBHOOK_TIMEOUT_MS`, `SYNC_WEBHOOK_RETRY_AFTER_MS` (default 300 s, alineado a lock en destino), `SYNC_WEBHOOK_GLOBAL_STAGGER_MS`; ver [`docs/sync_flows_and_api.md`](docs/sync_flows_and_api.md).

---

## Scripts npm

| Script | Uso |
|--------|-----|
| `npm run dev` | Servidor en caliente con `.env` actual. |
| `npm run dev:colombia` / `dev:peru` / `dev:chile` | Copia el `.env` del país y arranca el servidor. |
| `npm run build` | Compilación para producción (`node ace build`). |
| `npm start` | Arranque tras build (`node bin/server.js`). |
| `npm run test` | Suite Japa (migraciones en entorno de test). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |

---

## Tests

```bash
npm run test
```

Ejemplo de un solo archivo:

```bash
node ace test --files=tests/unit/sync_webhook_notifier.spec.ts
```

---

## Documentación adicional

| Archivo | Contenido |
|---------|------------|
| [`docs/sync_flows_and_api.md`](docs/sync_flows_and_api.md) | Flujos v1 vs v2, webhooks, keywords en variantes, price lists fuera de Chile. |
| [`.cursor/rules/project-context-and-flow.mdc`](.cursor/rules/project-context-and-flow.mdc) | Contexto rápido del proyecto (sync, servicios, convenciones). |

---

## Convenciones para el equipo

- **Nuevas rutas:** añadir archivo en `start/routes/` e importarlo en `start/routes.ts`.
- **Puertos:** interfaces en `app/application/ports/` o `app/ports/`; implementaciones en `infrastructure` o providers.
- **Sin prefijo `I` en interfaces** de puertos (convención del repo).
- **Migraciones:** no editar migraciones ya aplicadas en producción; añadir nuevas para cambios de esquema.

Si añades endpoints de sync o catálogo, actualiza este README o la doc de sync para que el próximo desarrollador encuentre el contrato HTTP y el flujo de negocio sin adivinar.
