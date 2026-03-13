# Comparativa de Esquemas: Microservicio de Productos vs Marcas

## Objetivo

Identificar las diferencias estructurales entre la base de datos del **microservicio centralizado de productos** (este repo, Aurora PostgreSQL) y la base de datos de las **marcas** (cada marca tiene su propia BD en PostgreSQL). Estas diferencias son clave para diseñar la sincronización global v2.

---

## 1. PRODUCTS

| Campo | Microservicio (`products`) | Marcas (`products_bigcommerce`) | Diferencia |
|-------|---------------------------|--------------------------------|------------|
| **Nombre de tabla** | `products` | `products_bigcommerce` | Diferente nombre de tabla |
| `id` | `integer PRIMARY KEY` | `increments('id')` (autoincremental) | Microservicio usa ID de BigCommerce como PK; marcas tienen autoincremental |
| `product_id` | `integer NOT NULL UNIQUE` | `integer PRIMARY KEY` | Microservicio lo tiene como campo separado con unique; marcas lo usan como PK |
| `image` | `string NOT NULL default ''` | `string NOT NULL` | Microservicio tiene default vacío |
| `images` | `json nullable default '[]'` | `json nullable default []` | Equivalente |
| `hover` | `string nullable default ''` | `string nullable` | Microservicio tiene default vacío |
| `title` | `string NOT NULL` | `string NOT NULL` | Equivalente |
| `page_title` | `string NOT NULL` | `string nullable` | Microservicio es NOT NULL; marcas permite NULL |
| `description` | `text NOT NULL` | `text NOT NULL` | Equivalente |
| `type` | `string NOT NULL` | `string NOT NULL` | Equivalente |
| `brand_id` | `integer FK -> brands.id ON DELETE SET NULL` | `integer FK -> brands.brand_id` | FK apunta a columnas distintas (id vs brand_id). Microservicio tiene ON DELETE SET NULL |
| `categories` | `json NOT NULL` (array de IDs) | -- | No existe en marcas como campo JSON |
| `categories_array` | -- | `json NOT NULL` | No existe en microservicio con este nombre |
| `stock` | `integer NOT NULL default 0` | `integer NOT NULL` | Microservicio tiene default 0 |
| `warning_stock` | `integer NOT NULL default 0` | `integer nullable` | Microservicio es NOT NULL con default; marcas permite NULL |
| `normal_price` | `integer NOT NULL` | `integer nullable` | Microservicio es NOT NULL; marcas permite NULL |
| `discount_price` | `integer NOT NULL` | `integer nullable` | Microservicio es NOT NULL; marcas permite NULL |
| `cash_price` | `integer NOT NULL` | `integer nullable` | Microservicio es NOT NULL; marcas permite NULL |
| `timer_price` | `integer nullable default 0` | `integer default 0` | Equivalente |
| `timer_status` | `boolean nullable default false` | `boolean default false` | Equivalente |
| `timer_datetime` | `timestamp nullable default null` | `timestamp nullable useTz` | Microservicio sin timezone; marcas con timezone |
| `percent` | `string nullable` | `string NOT NULL` | Microservicio permite NULL; marcas es NOT NULL |
| `url` | `string NOT NULL UNIQUE` | `string NOT NULL` | Microservicio tiene constraint UNIQUE; marcas no |
| `quantity` | `integer NOT NULL default 0` | `integer NOT NULL` | Microservicio tiene default 0 |
| `armed_cost` | `integer nullable` | `float NOT NULL` | Tipo diferente (integer vs float) y nullable vs NOT NULL |
| `weight` | `decimal(10,2) NOT NULL` | `float NOT NULL` | Tipo diferente (decimal vs float) |
| `sort_order` | `integer NOT NULL default 0` | `integer NOT NULL` | Microservicio tiene default 0 |
| `reserve` | `string nullable default ''` | `string nullable` | Microservicio tiene default vacío |
| `reviews` | `json nullable default '[]'` | `json nullable` | Microservicio tiene default |
| `sameday` | `boolean default false` | `boolean NOT NULL default false` | Marcas es explícitamente NOT NULL |
| `free_shipping` | `boolean default false` | `boolean NOT NULL default false` | Marcas es explícitamente NOT NULL |
| `despacho24horas` | `boolean default false` | `boolean NOT NULL default false` | Marcas es explícitamente NOT NULL |
| `featured` | `boolean default false` | `boolean NOT NULL default false` | Marcas es explícitamente NOT NULL |
| `pickup_in_store` | `boolean default false` | `boolean NOT NULL default false` | Marcas es explícitamente NOT NULL |
| `is_visible` | `boolean default true` | `boolean NOT NULL default false` | Default diferente (true vs false) |
| `turbo` | `boolean default false` | `boolean NOT NULL default false` | Marcas es explícitamente NOT NULL |
| `meta_description` | `text nullable default ''` | `string nullable default null` | Tipo diferente (text vs string) |
| `meta_keywords` | `json nullable default '[]'` | `json nullable default null` | Default diferente (array vacío vs null) |
| `sizes` | `json nullable default '[]'` | `json nullable` | Microservicio tiene default |
| `related_products` | `json nullable default '[]'` | -- | Solo existe en microservicio |
| `total_sold` | `integer NOT NULL default 0` | `integer nullable default 0` | Microservicio es NOT NULL; marcas permite NULL |
| `nextday` | -- | `boolean nullable default false` | Solo existe en marcas |
| **Índices** | Ninguno explícito | `brand_id`, `discount_price`, `is_visible+stock`, `sort_order`, `is_visible+brand_id+discount_price` | Marcas tienen índices optimizados; microservicio no |

### Diferencias Criticas en Products

1. **Nombre de tabla diferente**: `products` vs `products_bigcommerce`
2. **Estrategia de PK diferente**: microservicio usa `id` (BigCommerce ID) como PK + `product_id` como unique; marcas usan autoincremental + `product_id` como PK
3. **Campo `nextday`**: solo existe en marcas, microservicio no lo tiene
4. **Campo `related_products`**: solo existe en microservicio
5. **Campo de categorías**: `categories` (microservicio) vs `categories_array` (marcas) -- mismo concepto, distinto nombre
6. **Tipos numéricos inconsistentes**: `armed_cost` (integer vs float), `weight` (decimal vs float)
7. **Nullability de precios**: microservicio exige NOT NULL; marcas permite NULL
8. **Default de `is_visible`**: true en microservicio, false en marcas
9. **Sin índices en microservicio**: las marcas tienen índices de rendimiento que el microservicio no tiene

---

## 2. VARIANTS

| Campo | Microservicio (`variants`) | Marcas (`variants`) | Diferencia |
|-------|---------------------------|---------------------|------------|
| `id` | `integer PRIMARY KEY` | `integer PRIMARY KEY` | Equivalente |
| `product_id` | `integer FK -> products.id ON DELETE CASCADE nullable` | `integer unsigned` (sin FK) | Microservicio tiene FK con cascade; marcas no tiene FK |
| `title` | `string(255) NOT NULL` | `string NOT NULL` | Equivalente |
| `sku` | `string(255) NOT NULL UNIQUE` | `string NOT NULL` (sin unique) | Microservicio tiene constraint UNIQUE; marcas no |
| `normal_price` | `integer NOT NULL` | `float NOT NULL` | Tipo diferente (integer vs float) |
| `discount_price` | `integer NOT NULL` | `float NOT NULL` | Tipo diferente (integer vs float) |
| `cash_price` | `integer NOT NULL` | `float NOT NULL` | Tipo diferente (integer vs float) |
| `discount_rate` | `string(255) NOT NULL` | `string NOT NULL` | Equivalente |
| `stock` | `integer NOT NULL default 0` | `integer NOT NULL` | Microservicio tiene default 0 |
| `warning_stock` | `integer NOT NULL default 0` | `integer NOT NULL` | Microservicio tiene default 0 |
| `image` | `string(255) NOT NULL` | `string NOT NULL` | Equivalente |
| `images` | `json NOT NULL default '[]'` | `json NOT NULL` | Microservicio tiene default |
| `hover` | `string(255) nullable` | -- | Solo existe en microservicio |
| `categories` | `json nullable default '[]'` | -- | Solo existe en microservicio |
| `quantity` | `integer NOT NULL default 0` | `integer NOT NULL` | Microservicio tiene default 0 |
| `armed_cost` | `integer NOT NULL default 0` | `float NOT NULL` | Tipo diferente (integer vs float) |
| `armed_quantity` | `integer NOT NULL default 0` | `integer NOT NULL` | Microservicio tiene default 0 |
| `weight` | `float NOT NULL` | `float NOT NULL` | Equivalente |
| `height` | `float nullable` | `float nullable` | Equivalente |
| `width` | `float nullable` | `float nullable` | Equivalente |
| `depth` | `float nullable` | `float nullable` | Equivalente |
| `type` | `string(255) nullable` | `string nullable` | Equivalente |
| `options` | `jsonb nullable default '[]'` | `json nullable default '[]'` | Tipo diferente (jsonb vs json) |
| `related_products` | `json nullable default '[]'` | `json nullable default '[]'` | Equivalente |
| `option_label` | `text nullable` | -- | Solo existe en microservicio |
| `keywords` | `text NOT NULL default ''` | -- | Solo existe en microservicio |
| `is_visible` | `boolean default false` | -- | Solo existe en microservicio |
| `reserve` | -- | `string nullable` | Solo existe en marcas |

### Diferencias Criticas en Variants

1. **Tipos de precio diferentes**: microservicio usa `integer`; marcas usan `float`
2. **FK de product_id**: microservicio tiene FK con CASCADE; marcas no tiene FK
3. **Constraint UNIQUE en sku**: solo en microservicio
4. **Campos exclusivos del microservicio**: `hover`, `categories`, `option_label`, `keywords`, `is_visible`
5. **Campo exclusivo de marcas**: `reserve`
6. **options**: `jsonb` en microservicio vs `json` en marcas

---

## 3. CATEGORIES

| Campo | Microservicio (`categories`) | Marcas (`categories`) | Diferencia |
|-------|------------------------------|----------------------|------------|
| `category_id` | `integer PRIMARY KEY NOT NULL` | `integer PRIMARY KEY NOT NULL` | Equivalente |
| `title` | `string NOT NULL` | `string NOT NULL` | Equivalente |
| `url` | `string NOT NULL` | `string NOT NULL` | Equivalente |
| `parent_id` | `integer NOT NULL` | `integer NOT NULL` | Equivalente |
| `order` | `integer NOT NULL` | `integer NOT NULL` | Equivalente |
| `image` | `string nullable` | `string nullable` | Equivalente |
| `is_visible` | `boolean default false` | `boolean default false` | Equivalente |
| `tree_id` | `integer nullable` | `integer NOT NULL` | Microservicio permite NULL; marcas es NOT NULL |
| `description` | -- | `text nullable` | Solo existe en marcas |
| `page_title` | -- | `string nullable` | Solo existe en marcas |
| `search_keywords` | -- | `text nullable` | Solo existe en marcas |
| `meta_keywords` | -- | `text nullable` | Solo existe en marcas |
| `meta_description` | -- | `text nullable` | Solo existe en marcas |
| `sort_order` | -- | `integer NOT NULL` | Solo existe en marcas |
| **Índices** | Ninguno | `parent_id`, `is_visible`, `parent_id+is_visible`, `parent_id+is_visible+order`, `sort_order` | Marcas tienen índices; microservicio no |

### Diferencias Criticas en Categories

1. **6 campos faltantes en microservicio**: `description`, `page_title`, `search_keywords`, `meta_keywords`, `meta_description`, `sort_order`
2. **tree_id**: nullable en microservicio, NOT NULL en marcas
3. **Sin índices en microservicio**

---

## 4. CATEGORY_PRODUCTS

| Campo | Microservicio (`category_products`) | Marcas (`category_products`) | Diferencia |
|-------|-------------------------------------|------------------------------|------------|
| `id` | `increments PRIMARY KEY` | `increments PRIMARY KEY` | Equivalente |
| `product_id` | `FK -> products.id ON DELETE CASCADE` | `FK -> products_bigcommerce.product_id ON DELETE CASCADE` | FK apunta a columnas/tablas distintas |
| `category_id` | `FK -> categories.category_id ON DELETE CASCADE` | `FK -> categories.category_id ON DELETE CASCADE` | Equivalente |
| `unique` | `[product_id, category_id]` | `[product_id, category_id]` | Equivalente |
| **Índices** | Ninguno adicional | `product_id`, `category_id`, `category_id+product_id` | Marcas tienen índices adicionales |

### Diferencias Criticas

1. **FK de product_id apunta a columnas distintas**: microservicio a `products.id`; marcas a `products_bigcommerce.product_id`
2. **Sin índices adicionales en microservicio**

---

## 5. OPTIONS

| Campo | Microservicio (`options`) | Marcas (`option_of_products`) | Diferencia |
|-------|--------------------------|-------------------------------|------------|
| **Nombre de tabla** | `options` | `option_of_products` | Diferente nombre |
| **PK** | `increments('id')` autoincremental | Compuesta: `[option_id, product_id, label]` | Estrategia de PK completamente diferente |
| `product_id` | `FK -> products.id ON DELETE CASCADE` | `FK -> products_bigcommerce.product_id ON DELETE CASCADE` | FK apunta a tablas/columnas distintas |
| `option_id` | `integer NOT NULL` | `integer NOT NULL` | Equivalente |
| `label` | `string NOT NULL` | `string NOT NULL` | Equivalente |
| `options` | `json nullable default []` | `jsonb nullable default '[]'` | Tipo diferente (json vs jsonb) |
| `unique` | `[product_id, option_id]` | `[option_id, product_id]` | Mismo constraint, orden diferente |
| **Índices** | Ninguno adicional | `product_id`, `option_id`, `label` | Marcas tienen índices |

---

## 6. INVENTARIO / SAFE STOCK

| Tabla | Microservicio | Marcas |
|-------|--------------|--------|
| `catalog_safe_stocks` | Existe (estructura base) | Existe (misma estructura) |
| `inventory_reserve_peru` | No existe | Existe (con PK compuesta y índices) |
| `inventory_reserve_colombia` | No existe | Existe |

### Diferencias en catalog_safe_stocks

| Campo | Microservicio | Marcas | Diferencia |
|-------|--------------|--------|------------|
| `id` | `increments PRIMARY KEY` | `increments PRIMARY KEY` | Equivalente |
| `sku` | `string NOT NULL` | `string NOT NULL` | Equivalente |
| `product_id` | `integer NOT NULL` | `integer NOT NULL` | Equivalente |
| `variant_id` | `integer NOT NULL UNIQUE` | `integer NOT NULL` (sin unique) | Microservicio tiene UNIQUE; marcas no |
| `safety_stock` | `integer default 0` | `integer default 0` | Equivalente |
| `warning_level` | `integer nullable default 0` | `integer nullable` | Microservicio tiene default 0 |
| `available_to_sell` | `integer nullable default 0` | `integer nullable` | Microservicio tiene default 0 |
| `bin_picking_number` | `string nullable` | `string nullable` | Equivalente |

### Tablas de inventario de reserva

Las marcas de Peru y Colombia tienen tablas dedicadas `inventory_reserve_peru` e `inventory_reserve_colombia` con estructura similar a `catalog_safe_stocks` pero con índices adicionales (`variant_id`, `sku`) y PK compuesta. El microservicio no tiene estas tablas.

---

## 7. TABLAS EXCLUSIVAS

### Solo en Microservicio

| Tabla | Proposito |
|-------|-----------|
| `brands` | Catálogo de marcas (id, name) |
| `channels` | Canales de venta (id, name) |
| `channel_product` | Relación N:M producto-canal |
| `filters_products` | Relación producto-categoría para filtros avanzados |
| `users` | Autenticación |
| `auth_access_tokens` | Tokens de acceso |

### Solo en Marcas

| Tabla | Proposito |
|-------|-----------|
| `products_packs` | Packs de productos (pack_id, product_id, sku, stock, quantity, variant_id, reserve, serial) |
| `inventory_reserve_peru` | Stock de reserva para Peru |
| `inventory_reserve_colombia` | Stock de reserva para Colombia |

---

## 8. RESUMEN DE ACCIONES PARA SINCRONIZACION GLOBAL v2

### Campos que el microservicio necesita agregar

| Tabla | Campo | Tipo | Origen |
|-------|-------|------|--------|
| `products` | `nextday` | `boolean nullable default false` | Marcas |
| `categories` | `description` | `text nullable` | Marcas / BigCommerce |
| `categories` | `page_title` | `string nullable` | Marcas / BigCommerce |
| `categories` | `search_keywords` | `text nullable` | Marcas / BigCommerce |
| `categories` | `meta_keywords` | `text nullable` | Marcas / BigCommerce |
| `categories` | `meta_description` | `text nullable` | Marcas / BigCommerce |
| `categories` | `sort_order` | `integer NOT NULL default 0` | Marcas / BigCommerce |
| `variants` | `reserve` | `string nullable` | Marcas |

### Tipos que deben alinearse

| Tabla | Campo | Microservicio | Marcas | Recomendacion |
|-------|-------|--------------|--------|---------------|
| `products` | `armed_cost` | `integer nullable` | `float NOT NULL` | Cambiar a `float` (precisión decimal necesaria) |
| `products` | `weight` | `decimal(10,2)` | `float` | Mantener `decimal(10,2)` (mas preciso) |
| `variants` | `normal_price` | `integer` | `float` | Cambiar a `float` o `decimal` (precios con decimales en CO/PE) |
| `variants` | `discount_price` | `integer` | `float` | Cambiar a `float` o `decimal` |
| `variants` | `cash_price` | `integer` | `float` | Cambiar a `float` o `decimal` |
| `variants` | `armed_cost` | `integer` | `float` | Cambiar a `float` |
| `variants` | `options` | `jsonb` | `json` | Mantener `jsonb` (permite queries mas eficientes en PostgreSQL) |

### Indices que el microservicio necesita agregar

| Tabla | Indices recomendados |
|-------|---------------------|
| `products` | `brand_id`, `discount_price`, `is_visible+stock`, `sort_order`, `is_visible+brand_id+discount_price` |
| `categories` | `parent_id`, `is_visible`, `parent_id+is_visible`, `parent_id+is_visible+order`, `sort_order` |
| `category_products` | `product_id`, `category_id`, `category_id+product_id` |
| `options` | `product_id`, `option_id` |
| `variants` | `product_id`, `sku` |

### Normalizacion de nombres

| Concepto | Microservicio | Marcas | Recomendacion |
|----------|--------------|--------|---------------|
| Tabla de productos | `products` | `products_bigcommerce` | Mantener `products` (nombre genérico, centralizado) |
| Campo de categorías en producto | `categories` | `categories_array` | Mantener `categories` en microservicio; las marcas adaptan al consumir |
| Tabla de opciones | `options` | `option_of_products` | Mantener `options` en microservicio |
| FK de brand | `brands.id` | `brands.brand_id` | Unificar en la respuesta del endpoint |

### Decisiones RESUELTAS para la sync global v2

1. **Precios: `float`** -- Se usará `float` para todos los campos de precio (normal_price, discount_price, cash_price, armed_cost) tanto en products como en variants. Alineado con lo que ya usan las marcas. Chile redondea naturalmente (CLP sin decimales), Colombia y Peru conservan sus decimales.

2. **Inventario de reserva: tabla genérica `inventory_reserve`** -- Se creará UNA sola tabla `inventory_reserve` (sin nombre de país). El microservicio actúa según el país configurado en `COUNTRY_CODE` del `.env`, por lo que la tabla es agnóstica al país. Reemplaza las tablas `inventory_reserve_peru` e `inventory_reserve_colombia` de las marcas.

3. **Packs: se incluirán** -- Se creará una sincronización de packs en este microservicio. La implementación se definirá más adelante. Por ahora se reserva la tabla `products_packs` como parte del esquema objetivo.

4. **Mapeo de IDs: exponer ambos** -- Los endpoints expondrán tanto `id` (BigCommerce ID, PK del microservicio) como `product_id` en las respuestas. Cada marca usa el que necesite sin restricciones. Esto evita migraciones de PK y mantiene compatibilidad con ambas estrategias.

5. **Canales por producto desde BigCommerce** -- Al usar `include: ['channels']` en la API de productos, cada producto trae un array `channels: number[]` con los IDs de canales a los que pertenece. Esto permite:
   - Sincronización global en una sola llamada (`getAll` con `include: ['images', 'variants', 'channels']`)
   - Poblar la tabla `channel_product` directamente desde el payload del producto, sin necesidad de llamar a `getProductsByChannel` por separado
   - Eliminar el flujo actual de: obtener IDs por canal -> obtener detalle por IDs -> repetir por cada canal
   - Las marcas no tienen tabla `channel_product` porque cada marca ES un canal. El microservicio centralizado sí la necesita para saber qué producto pertenece a qué marca/canal.

---

## 9. MIGRACIONES REQUERIDAS PARA SYNC GLOBAL v2

### Nuevas migraciones a crear

| Migración | Descripción |
|-----------|-------------|
| `alter_products_add_nextday` | Agregar campo `nextday boolean nullable default false` a products |
| `alter_products_change_price_types` | Cambiar `normal_price`, `discount_price`, `cash_price`, `armed_cost` de integer a float en products |
| `alter_variants_change_price_types` | Cambiar `normal_price`, `discount_price`, `cash_price`, `armed_cost` de integer a float en variants |
| `alter_variants_add_reserve` | Agregar campo `reserve string nullable` a variants |
| `alter_categories_add_missing_fields` | Agregar `description`, `page_title`, `search_keywords`, `meta_keywords`, `meta_description`, `sort_order` a categories |
| `alter_categories_tree_id_not_null` | Cambiar `tree_id` de nullable a NOT NULL (alinear con marcas) |
| `create_inventory_reserve` | Nueva tabla `inventory_reserve` (sku, product_id, variant_id, safety_stock, warning_level, available_to_sell, bin_picking_number) |
| `create_products_packs` | Nueva tabla `products_packs` (pack_id, product_id, sku, stock, quantity, is_variant, variant_id, reserve, serial) |
| `add_indexes_products` | Índices de rendimiento en products |
| `add_indexes_categories` | Índices de rendimiento en categories |
| `add_indexes_category_products` | Índices adicionales en category_products |
| `add_indexes_variants` | Índices en variants (product_id, sku) |
| `add_indexes_options` | Índices en options (product_id, option_id) |

### Orden de ejecución recomendado

1. Primero: migraciones de alteración de tipos (precios float)
2. Segundo: migraciones de campos nuevos (nextday, reserve, campos de categories)
3. Tercero: nuevas tablas (inventory_reserve, products_packs)
4. Cuarto: índices de rendimiento (al final, no bloquean funcionalidad)
