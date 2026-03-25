import type { SizesConfig } from '#application/dto/sizes_config.dto'
import env from '#start/env'
import { parseEnvInt } from '#utils/env_parser'

function storeIds(
  smallKey: string,
  mediumKey: string,
  bigKey: string
): { small: number | null; medium: number | null; big: number | null } {
  return {
    small: parseEnvInt(smallKey),
    medium: parseEnvInt(mediumKey),
    big: parseEnvInt(bigKey),
  }
}

/**
 * Construye la config de sizes desde env (COUNTRY_CODE e ID_* por tienda).
 * Punto unico de lectura de env para sizes; el formatter recibe la config.
 */
export function getSizesConfig(): SizesConfig {
  const countryCode = env.get('COUNTRY_CODE') ?? 'PE'

  if (countryCode === 'CL') {
    return {
      countryCode: 'CL',
      stores: {
        napoleon: storeIds('ID_SMALL_NAPOLEON', 'ID_MEDIUM_NAPOLEON', 'ID_BIG_NAPOLEON'),
        vitacura: storeIds('ID_SMALL_VITACURA', 'ID_MEDIUM_VITACURA', 'ID_BIG_VITACURA'),
        condor: storeIds('ID_SMALL_CONDOR', 'ID_MEDIUM_CONDOR', 'ID_BIG_CONDOR'),
        quilicura: storeIds('ID_SMALL_QUILICURA', 'ID_MEDIUM_QUILICURA', 'ID_BIG_QUILICURA'),
        vina: storeIds('ID_SMALL_VINA', 'ID_MEDIUM_VINA', 'ID_BIG_VINA'),
        concon: storeIds('ID_SMALL_CONCON', 'ID_MEDIUM_CONCON', 'ID_BIG_CONCON'),
        concepcion: storeIds(
          'ID_SMALL_CONCEPCION',
          'ID_MEDIUM_CONCEPCION',
          'ID_BIG_CONCEPCION'
        ),
        retirocondes: storeIds(
          'ID_SMALL_RETIROCONDES',
          'ID_MEDIUM_RETIROCONDES',
          'ID_BIG_RETIROCONDES'
        ),
        condes: storeIds('ID_SMALL_CONDES', 'ID_MEDIUM_CONDES', 'ID_BIG_CONDES'),
      },
    }
  }

  if (countryCode === 'CO') {
    return {
      countryCode: 'CO',
      stores: {
        fulppi: storeIds('ID_SMALL_FULPPI', 'ID_MEDIUM_FULPPI', 'ID_BIG_FULPPI'),
        bogota: storeIds('ID_SMALL_BOGOTA', 'ID_MEDIUM_BOGOTA', 'ID_BIG_BOGOTA'),
      },
    }
  }

  return {
    countryCode: 'PE',
    stores: {
      buenaventura: storeIds(
        'ID_SMALL_BUENAVENTURA',
        'ID_MEDIUM_BUENAVENTURA',
        'ID_BIG_BUENAVENTURA'
      ),
      urbano: storeIds('ID_SMALL_URBANO', 'ID_MEDIUM_URBANO', 'ID_BIG_URBANO'),
      surco: storeIds('ID_SMALL_SURCO', 'ID_MEDIUM_SURCO', 'ID_BIG_SURCO'),
      miraflores: storeIds(
        'ID_SMALL_MIRAFLORES',
        'ID_MEDIUM_MIRAFLORES',
        'ID_BIG_MIRAFLORES'
      ),
      sanmiguel: storeIds(
        'ID_SMALL_SANMIGUEL',
        'ID_MEDIUM_SANMIGUEL',
        'ID_BIG_SANMIGUEL'
      ),
      sanjuan: storeIds('ID_SMALL_SANJUAN', 'ID_MEDIUM_SANJUAN', 'ID_BIG_SANJUAN'),
    },
  }
}
