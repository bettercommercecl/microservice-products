# 📋 API de Canales - Documentación

## 🎯 Channel IDs Reales

Los siguientes son los `channel_id` únicos extraídos de la configuración de canales:

| Channel ID | Marca                  | País       | Nombre del Canal    |
| ---------- | ---------------------- | ---------- | ------------------- |
| `1`        | UF (Ultimate Fitness)  | CL, CO, PE | UF_CL, UF_CO, UF_PE |
| `1420393`  | FC (First Care)        | CL, PE     | FC_CL, FC_PE        |
| `1443267`  | AF (Aqua Force)        | CL, CO, PE | AF_CL, AF_CO, AF_PE |
| `1461778`  | TS (TSpin)             | CL         | TS_CL               |
| `1457601`  | TF (Terra Force)       | CL, CO, PE | TF_CL, TF_CO, TF_PE |
| `1501686`  | AR (Around)            | CL, CO, PE | AR_CL, AR_CO, AR_PE |
| `1567036`  | CC (Camillas Chile)    | CL         | CC_CL               |
| `1598942`  | SF (Snow Force)        | CL         | SF_CL               |
| `1598942`  | UC (Ultimate Clothing) | CL, CO, PE | UC_CL, UC_CO, UC_PE |
| `1724574`  | MK (Muu Kids)          | CL         | MK_CL               |

## 🚀 Endpoints Disponibles

### Rutas Generales

```http
GET    /api/channels                    # Obtener todos los canales
GET    /api/channels/with-products      # Obtener canales con productos
POST   /api/channels/sync               # Sincronizar canales desde configuración
GET    /api/channels/:id                # Obtener canal por ID (genérico)
```

### Rutas Específicas por Channel ID

```http
# Ultimate Fitness (ID: 1)
GET    /api/channels/1                  # Obtener canal UF
GET    /api/channels/1/products         # Obtener productos del canal UF

# First Care (ID: 1420393)
GET    /api/channels/1420393            # Obtener canal FC
GET    /api/channels/1420393/products   # Obtener productos del canal FC

# Aqua Force (ID: 1443267)
GET    /api/channels/1443267            # Obtener canal AF
GET    /api/channels/1443267/products   # Obtener productos del canal AF

# TSpin (ID: 1461778)
GET    /api/channels/1461778            # Obtener canal TS
GET    /api/channels/1461778/products   # Obtener productos del canal TS

# Terra Force (ID: 1457601)
GET    /api/channels/1457601            # Obtener canal TF
GET    /api/channels/1457601/products   # Obtener productos del canal TF

# Around (ID: 1501686)
GET    /api/channels/1501686            # Obtener canal AR
GET    /api/channels/1501686/products   # Obtener productos del canal AR

# Camillas Chile (ID: 1567036)
GET    /api/channels/1567036            # Obtener canal CC
GET    /api/channels/1567036/products   # Obtener productos del canal CC

# Snow Force / Ultimate Clothing (ID: 1598942)
GET    /api/channels/1598942            # Obtener canal SF/UC
GET    /api/channels/1598942/products   # Obtener productos del canal SF/UC

# Muu Kids (ID: 1724574)
GET    /api/channels/1724574            # Obtener canal MK
GET    /api/channels/1724574/products   # Obtener productos del canal MK
```

## 📊 Estructura de Respuesta

### Respuesta Exitosa

```json
{
  "success": true,
  "data": {
    "id": 1420393,
    "name": "FC_CL",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Respuesta de Lista

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "UF_CL"
    },
    {
      "id": 1420393,
      "name": "FC_CL"
    }
  ],
  "meta": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "total": 2
  }
}
```

### Respuesta de Sincronización

```json
{
  "success": true,
  "message": "Sincronización de canales completada exitosamente",
  "data": {
    "created": 5,
    "updated": 2,
    "errors": []
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "totalProcessed": 7
  }
}
```

## 🧪 Tests de Integración

Los tests cubren:

- ✅ Obtener todos los canales
- ✅ Obtener canal por ID específico
- ✅ Obtener canales con productos
- ✅ Sincronizar canales desde configuración
- ✅ Manejo de errores y casos edge
- ✅ Validación de channel_id reales
- ✅ Rendimiento y integridad de datos

## 🔧 Configuración

Los channel_id se extraen automáticamente del archivo de configuración:
`app/utils/channels/channels.ts`

```typescript
const CHANNEL_IDS = [
  1, // UF (Ultimate Fitness) - CL, CO, PE
  1420393, // FC (First Care) - CL, PE
  1443267, // AF (Aqua Force) - CL, CO, PE
  1461778, // TS (TSpin) - CL
  1457601, // TF (Terra Force) - CL, CO, PE
  1501686, // AR (Around) - CL, CO, PE
  1567036, // CC (Camillas Chile) - CL
  1598942, // SF (Snow Force) - CL, UC (Ultimate Clothing) - CL, CO, PE
  1724574, // MK (Muu Kids) - CL
]
```

## 🚨 Notas Importantes

1. **Channel ID 1598942** se usa para dos marcas: Snow Force (SF) y Ultimate Clothing (UC)
2. **Channel ID 1** se usa para Ultimate Fitness en múltiples países (CL, CO, PE)
3. Las rutas específicas se generan automáticamente basadas en los channel_id únicos
4. Los tests usan channel_id reales para mayor precisión
5. La sincronización crea canales con los nombres correctos: `{MARCA}_{PAIS}`
