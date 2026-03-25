# Postman - Products API

## Colección
- **Products_API.postman_collection.json**: todas las rutas del microservicio.

## Base URL
La colección usa la variable `baseUrl`. Valores por entorno:

| Entorno | baseUrl |
|---------|---------|
| Chile   | `https://products.bettercommerce.cl/api` |
| Colombia| `https://co.products.bettercommerce.cl/api` |
| Peru    | `https://pe.products.bettercommerce.cl/api` |
| Local   | `http://localhost:3333/api` |
| 127     | `http://127.0.0.1:3333/api` |

En Postman: crea entornos (Environments) con variable `baseUrl` y el valor de la tabla, o edita la variable a nivel de colección.

## Carpetas en la colección
- **Brands** – Marcas
- **Categories** – Categorías
- **Channels** – Canales (CRUD)
- **Products** – Productos y sync-stats
- **Variants** – Variantes
- **Sync (v1 legacy)** – Sincronizaciones por canal (sincronizar-productos/:channel_id, categorias, marcas, canales)
- **Sync (v2)** – Sync bajo /api/sync (completo, marcas, categorias, productos, packs, packs-reserva, stock)
- **Sync (alias legacy)** – /api/sincronizar-productos, sincronizar-packs, sincronizar-stock
- **Sync v1** – /api/sync/v1/productos, packs, stock
