import env from '#start/env'
export const PARENT = {
  1: env.get('COUNTRY_CODE') ==='CL' ? 4159 : env.get('COUNTRY_CODE') === 'CO' ? 3056 :  2780, // UF
  1443267: env.get('COUNTRY_CODE') ==='CL' ? 0 : env.get('COUNTRY_CODE') === 'CO' ? 2933 : 1838, // AF
  1457601: env.get('COUNTRY_CODE') ==='CL' ? 4158 : env.get('COUNTRY_CODE') === 'CO' ? 2931 : 2717, //TF
  1501686: env.get('COUNTRY_CODE') === 'CL' ? 0 : env.get('COUNTRY_CODE') === 'CO' ? 3057 :  2674, // AR
  1461778: 0, // TS
  1573014: 0,  // SF
  1598942: env.get('COUNTRY_CODE') === 'CL' ? 1828 : env.get('COUNTRY_CODE') === 'CO' ? 2423 : 2203,// UC
  1420393: env.get('COUNTRY_CODE') === 'CL' ? 1338  : 1470 //  <----FC PE
  1567036: env.get('COUNTRY_CODE') === 'CL' ? 1342 : 0, // C.C
} as const;
  


  
