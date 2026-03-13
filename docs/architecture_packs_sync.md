# Arquitectura: Sincronización de Packs

## Contexto

Replicar la lógica de `SyncProductsPacksService` de las marcas en el microservicio de productos, con mejoras de modularidad y claridad en el modelo de datos.

---

## Tipos de Packs

### Pack simple (`is_variant = false`)

- **Origen**: `items_packs` viene directamente del producto en BigCommerce (metafield o campo a nivel producto).
- **Estructura**: Cada item tiene `product` (SKU) y `quantity`. No hay `variant_id` en el payload.
- **Semántica**: El pack agrupa productos/variantes por SKU. Cada SKU corresponde a una variante en nuestro catálogo.

### Pack de variantes (`is_variant = true`)

- **Origen**: `items_packs` se construye desde metafields de cada variante del pack (`key === 'packs'`).
- **Estructura**: Cada item tiene `product` (SKU), `quantity`, `variant_id` e `is_variant: true`.
- **Semántica**: El pack tiene múltiples variantes; cada variante define sus propios items (qué SKUs y cantidades incluye).

---

## Modelo de datos: `products_packs`

| Columna      | Tipo    | Descripción                                                                 |
|-------------|---------|-----------------------------------------------------------------------------|
| pack_id     | integer | ID del producto pack en BigCommerce                                         |
| product_id  | integer | ID del producto del item (desde CatalogSafeStock)                           |
| sku         | string  | SKU del item                                                                |
| stock       | integer | Stock disponible para el pack (0 si no hay stock suficiente)                |
| quantity    | integer | Cantidad requerida del item en el pack                                      |
| is_variant  | boolean | `false` = pack simple, `true` = pack de variantes                           |
| variant_id  | integer | ID de la variante del item (siempre que exista en catálogo)                |
| serial      | string  | bin_picking_number (CatalogSafeStock)                                       |
| reserve     | string  | Reserve de la variante (desde tabla variants)                               |

### Reglas para `variant_id` e `is_variant`

| Tipo de pack | is_variant | variant_id |
|--------------|------------|------------|
| Simple       | `false`    | `CatalogSafeStock.variant_id` (variante que tiene ese SKU) |
| Variantes    | `true`     | `item.variant_id` (del metafield de la variante)           |

**Por qué `variant_id` también en packs simples**

- Permite consultas unificadas (ej. stock por variante).
- Mantiene trazabilidad SKU → variante.
- Evita joins adicionales cuando se necesita la variante.
- Si el SKU no existe en catálogo, `variant_id` puede ser `null` o `0` según convención.

**Por qué `is_variant`**

- Distingue el origen del item: producto vs variante.
- Facilita filtros y reportes (packs simples vs packs de variantes).
- Evita ambigüedad cuando `variant_id` existe en ambos casos.

---

## Flujo de sincronización

```
syncPacksFromBigcommerce()
  │
  ├─► getAllProductsPacks()           [BigCommerce: productos tipo pack]
  ├─► getVariantsOfPacks()           [BigCommerce: variantes por pack]
  ├─► prepareDataPacks()              [BigCommerce: metafields por variante si aplica]
  ├─► formatProductsPacks()           [Local: CatalogSafeStock + variants]
  ├─► saveProductsOfPacksInDatabase() [Local: truncate + insert]
  └─► getPackIdsWithZeroStock()       [Local]
      updateProductsVisibility()      [Local: is_visible=false para packs sin stock]
```

---

## Llamadas a BigCommerce

| Método                         | Endpoint                                                                 | Estado en microservicio |
|--------------------------------|--------------------------------------------------------------------------|--------------------------|
| getAllProductsPacks            | Productos con metafield/campo que los marca como pack                    | Por implementar          |
| getVariantsOfProduct           | GET /v3/catalog/products/{id}/variants                                   | Existe                   |
| getMetafieldsByPacksVariants  | GET /v3/catalog/products/{product_id}/variants/{variant_id}/metafields?key=packs | Por implementar          |

---

## Cambio en `formatProductsPacks`

### Situación actual (marcas)

```javascript
// Packs simples: variant_id = 0, is_variant = false
formattedPacks.push({
  variant_id: item?.variant_id || 0,  // Siempre 0 para simples
  is_variant: item?.is_variant || false,
  ...
})
```

### Propuesta

```javascript
// Packs simples: variant_id desde CatalogSafeStock, is_variant = false
// Packs variantes: variant_id desde item, is_variant = true
const variantId = item?.variant_id ?? inventoryProduct?.variant_id ?? null
const isVariant = item?.is_variant ?? false

formattedPacks.push({
  variant_id: variantId,
  is_variant: isVariant,
  ...
})
```

- **Packs simples**: `variant_id` desde `CatalogSafeStock.variant_id` (ya disponible al buscar por SKU).
- **Packs variantes**: `variant_id` desde `item.variant_id` (metafield).
- **is_variant**: explícito según el origen del item.

---

## Migración `products_packs`

La tabla aún no existe en el microservicio. Esquema sugerido:

```sql
CREATE TABLE products_packs (
  id SERIAL PRIMARY KEY,
  pack_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  sku VARCHAR(255) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER,
  is_variant BOOLEAN NOT NULL DEFAULT false,
  variant_id INTEGER,
  serial VARCHAR(255),
  reserve VARCHAR(255),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE INDEX idx_products_packs_pack_id ON products_packs(pack_id);
CREATE INDEX idx_products_packs_sku ON products_packs(sku);
CREATE INDEX idx_products_packs_is_variant ON products_packs(is_variant);
```

---

## Checklist pre-implementación

- [x] Definir cómo BigCommerce identifica packs (PACKS_CATEGORY_ID en env).
- [x] Implementar `getAllProductsPacks` en el módulo de BigCommerce (packs).
- [x] Implementar `getMetafieldsByVariant(productId, variantId, key)` en módulo variants.
- [x] Crear migración `products_packs`.
- [x] Crear modelo `ProductPack`.
- [x] Implementar `PacksSyncService` siguiendo el patrón de `complete_sync_service`.
- [x] Integrar con interceptor de rate limit existente.

---

## Notas

- **CatalogSafeStock**: El modelo usa `catalog_safe_stock`; la migración usa `catalog_safe_stocks`. Verificar alineación.
- **ProductsBigcommerce → Product**: En el microservicio se usa `Product` para actualizar visibilidad.
- **Reserve**: Se obtiene de la tabla `variants` por SKU; la columna `reserve` ya existe.
