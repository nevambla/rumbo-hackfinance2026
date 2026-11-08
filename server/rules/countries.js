// Tax rules for the 5 MVP countries.
//
// Convention (contexto.md §6): every rule has `country`, `rule`, `threshold`,
// `source_url` and `verified_at`. No rule without a source.
//
// `verified_at: null` means the team has NOT yet checked the rule against the
// official source. The UI shows those rules as "pendiente de verificar".
// Figures are simplified approximations for the hackathon demo — NOT tax advice.

export const COUNTRIES = {
  ES: { code: 'ES', name: 'España', flag: '🇪🇸', currency: 'EUR', eu: true },
  PT: { code: 'PT', name: 'Portugal', flag: '🇵🇹', currency: 'EUR', eu: true },
  MX: { code: 'MX', name: 'México', flag: '🇲🇽', currency: 'MXN', eu: false },
  CO: { code: 'CO', name: 'Colombia', flag: '🇨🇴', currency: 'COP', eu: false },
  TH: { code: 'TH', name: 'Tailandia', flag: '🇹🇭', currency: 'THB', eu: false },
};

// ---------------------------------------------------------------------------
// Residency rules
// ---------------------------------------------------------------------------
// window: 'calendar_year' | 'rolling_365'
export const RESIDENCY_RULES = [
  {
    country: 'ES',
    rule: 'residency_days',
    threshold: 183,
    window: 'calendar_year',
    description:
      'Residente si permanece más de 183 días en el año natural, o si radica en España el núcleo principal de sus actividades o intereses económicos, o si residen aquí su cónyuge e hijos menores (art. 9 LIRPF). Las ausencias esporádicas cuentan como días en España salvo que se acredite residencia fiscal en otro país.',
    source_url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764#a9',
    verified_at: null,
  },
  {
    country: 'PT',
    rule: 'residency_days',
    threshold: 183,
    window: 'rolling_365',
    description:
      'Residente si permanece más de 183 días, seguidos o no, en cualquier periodo de 12 meses que empiece o termine en el año, o si dispone de vivienda que haga suponer intención de residencia habitual (art. 16 CIRS).',
    source_url: 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs16.aspx',
    verified_at: null,
  },
  {
    country: 'MX',
    rule: 'residency_days',
    threshold: 183,
    window: 'calendar_year',
    description:
      'El criterio legal principal es tener casa habitación en México o el centro de intereses vitales (art. 9 CFF). En el MVP usamos 183 días como aproximación de alerta temprana; confirmar con asesor.',
    source_url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CFF.pdf',
    verified_at: null,
  },
  {
    country: 'CO',
    rule: 'residency_days',
    threshold: 183,
    window: 'rolling_365',
    description:
      'Residente si permanece más de 183 días calendario, continuos o discontinuos, dentro de cualquier periodo de 365 días consecutivos (art. 10 Estatuto Tributario).',
    source_url: 'https://www.dian.gov.co/normatividad/Normatividad/Estatuto%20Tributario.pdf',
    verified_at: null,
  },
  {
    country: 'TH',
    rule: 'residency_days',
    threshold: 180,
    window: 'calendar_year',
    description:
      'Residente si permanece 180 días o más en el año natural (Revenue Code, sección 41). Desde 2024 la renta extranjera remitida a Tailandia tributa para residentes.',
    source_url: 'https://www.rd.go.th/english/6045.html',
    verified_at: null,
  },
];

// ---------------------------------------------------------------------------
// Income tax brackets (annual, local currency, marginal rates)
// ---------------------------------------------------------------------------
// `taxable_share` approximates the share of freelance gross income that is
// taxable (e.g. Portugal simplified regime: 75% of service income).
export const INCOME_TAX_RULES = [
  {
    country: 'ES',
    rule: 'income_tax_brackets',
    threshold: null,
    currency: 'EUR',
    taxable_share: 0.93, // ~7% gastos de difícil justificación / deducibles medios
    brackets: [
      [12450, 0.19], [20200, 0.24], [35200, 0.30], [60000, 0.37], [300000, 0.45], [Infinity, 0.47],
    ],
    description: 'Escala general IRPF (estatal + autonómica media).',
    source_url: 'https://sede.agenciatributaria.gob.es/Sede/irpf.html',
    verified_at: null,
  },
  {
    country: 'PT',
    rule: 'income_tax_brackets',
    threshold: null,
    currency: 'EUR',
    taxable_share: 0.75, // regime simplificado, categoria B serviços
    brackets: [
      [8059, 0.125], [12160, 0.16], [17233, 0.215], [22306, 0.244], [28400, 0.314],
      [41629, 0.349], [44987, 0.431], [83696, 0.446], [Infinity, 0.48],
    ],
    description: 'Taxas gerais de IRS (art. 68 CIRS), régimen simplificado al 75%.',
    source_url: 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs68.aspx',
    verified_at: null,
  },
  {
    country: 'MX',
    rule: 'income_tax_brackets',
    threshold: null,
    currency: 'MXN',
    taxable_share: 0.9,
    brackets: [
      [8952.49, 0.0192], [75984.55, 0.064], [133536.07, 0.1088], [155229.8, 0.16], [185852.57, 0.1792],
      [374837.88, 0.2136], [590795.99, 0.2352], [1127926.84, 0.30], [1503902.46, 0.32], [4511707.37, 0.34], [Infinity, 0.35],
    ],
    description: 'Tarifa anual ISR personas físicas (art. 152 LISR).',
    source_url: 'https://www.sat.gob.mx/',
    verified_at: null,
  },
  {
    country: 'CO',
    rule: 'income_tax_brackets',
    threshold: null,
    currency: 'COP',
    taxable_share: 0.75, // renta exenta del 25% (con tope)
    // Expressed in COP using UVT 2025 = 49.799 COP
    brackets: [
      [1090 * 49799, 0], [1700 * 49799, 0.19], [4100 * 49799, 0.28], [8670 * 49799, 0.33],
      [18970 * 49799, 0.35], [31000 * 49799, 0.37], [Infinity, 0.39],
    ],
    description: 'Tabla art. 241 Estatuto Tributario (en UVT).',
    source_url: 'https://www.dian.gov.co/',
    verified_at: null,
  },
  {
    country: 'TH',
    rule: 'income_tax_brackets',
    threshold: null,
    currency: 'THB',
    taxable_share: 0.6, // deducción estándar de gastos (aprox.)
    brackets: [
      [150000, 0], [300000, 0.05], [500000, 0.10], [750000, 0.15], [1000000, 0.20],
      [2000000, 0.25], [5000000, 0.30], [Infinity, 0.35],
    ],
    description: 'Personal Income Tax rates (Revenue Code s. 48).',
    source_url: 'https://www.rd.go.th/english/6045.html',
    verified_at: null,
  },
];

// ---------------------------------------------------------------------------
// Social security for self-employed (approx. effective rate on net income)
// ---------------------------------------------------------------------------
export const SOCIAL_SECURITY_RULES = [
  { country: 'ES', rule: 'self_employed_ss', threshold: null, rate: 0.10, description: 'RETA: cuota por tramos de rendimientos (aprox. 10% efectivo). Con certificado A1 se puede seguir cotizando en España desde otro país UE.', source_url: 'https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/CotizacionRecaudacionTrabajadores/36537', verified_at: null },
  { country: 'PT', rule: 'self_employed_ss', threshold: null, rate: 0.149, description: 'Segurança Social trabalhadores independentes: 21,4% sobre el 70% del rendimiento relevante.', source_url: 'https://www.seg-social.pt/trabalhadores-independentes', verified_at: null },
  { country: 'MX', rule: 'self_employed_ss', threshold: null, rate: 0.05, description: 'Incorporación voluntaria al IMSS (aprox.).', source_url: 'https://www.imss.gob.mx/', verified_at: null },
  { country: 'CO', rule: 'self_employed_ss', threshold: null, rate: 0.113, description: 'Salud 12,5% + pensión 16% sobre el 40% del ingreso (aprox. 11,4%).', source_url: 'https://www.ugpp.gov.co/', verified_at: null },
  { country: 'TH', rule: 'self_employed_ss', threshold: null, rate: 0.02, description: 'Seguridad social voluntaria (Sección 40), cuota fija baja.', source_url: 'https://www.sso.go.th/', verified_at: null },
];

// ---------------------------------------------------------------------------
// VAT
// ---------------------------------------------------------------------------
export const VAT_RULES = [
  { country: 'ES', rule: 'vat_standard', threshold: null, rate: 0.21, description: 'IVA general 21%. Servicios B2B a empresa de otro país UE: inversión del sujeto pasivo (art. 196 Directiva 2006/112/CE). Servicios B2B fuera de la UE: no sujeto (art. 69 LIVA).', source_url: 'https://sede.agenciatributaria.gob.es/Sede/iva.html', verified_at: null },
  { country: 'PT', rule: 'vat_standard', threshold: null, rate: 0.23, description: 'IVA normal 23% (continente).', source_url: 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva18.aspx', verified_at: null },
  { country: 'MX', rule: 'vat_standard', threshold: null, rate: 0.16, description: 'IVA 16%. Exportación de servicios puede tributar al 0%.', source_url: 'https://www.sat.gob.mx/', verified_at: null },
  { country: 'CO', rule: 'vat_standard', threshold: null, rate: 0.19, description: 'IVA 19%. Exportación de servicios exenta con requisitos.', source_url: 'https://www.dian.gov.co/', verified_at: null },
  { country: 'TH', rule: 'vat_standard', threshold: 1800000, rate: 0.07, description: 'VAT 7%. Registro obligatorio a partir de 1,8 M THB de facturación anual.', source_url: 'https://www.rd.go.th/english/6043.html', verified_at: null },
];

// ---------------------------------------------------------------------------
// Special regimes (legal optimisation, never fake residency)
// ---------------------------------------------------------------------------
export const SPECIAL_REGIMES = [
  {
    country: 'ES',
    rule: 'special_regime',
    id: 'beckham',
    name: 'Régimen de impatriados ("Ley Beckham")',
    threshold: 5, // years not resident in Spain
    summary: 'Tributación como no residente (24% hasta 600.000 €) durante 6 años. Desde 2023 incluye nómadas digitales y emprendedores.',
    requirements: ['No haber sido residente fiscal en España en los 5 años anteriores', 'Desplazamiento por trabajo, teletrabajo (visado nómada digital) o emprendimiento', 'Solicitarlo en los 6 meses siguientes al alta en Seguridad Social'],
    source_url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764#a93',
    verified_at: null,
  },
  {
    country: 'PT',
    rule: 'special_regime',
    id: 'ifici',
    name: 'IFICI ("NHR 2.0")',
    threshold: 5,
    summary: 'Tipo fijo del 20% sobre rentas de actividades cualificadas durante 10 años. Sustituye al antiguo régimen de residente no habitual (RNH).',
    requirements: ['No haber sido residente fiscal en Portugal en los 5 años anteriores', 'Actividad cualificada (I+D, startups certificadas, profesiones altamente cualificadas…)', 'Solicitud hasta el 15 de enero del año siguiente al de la residencia'],
    source_url: 'https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/Folhetos_informativos/Documents/IFICI_FAQ.pdf',
    verified_at: null,
  },
  {
    country: 'TH',
    rule: 'special_regime',
    id: 'ltr',
    name: 'Visado LTR (Long-Term Resident)',
    threshold: null,
    summary: 'Para "work-from-Thailand professionals": exención sobre renta extranjera y 10 años de visado.',
    requirements: ['Ingresos de 80.000 USD/año en los últimos 2 años (o 40.000 con requisitos extra)', 'Empleador o clientes con facturación relevante', 'Seguro médico'],
    source_url: 'https://ltr.boi.go.th/',
    verified_at: null,
  },
  {
    country: 'CO',
    rule: 'special_regime',
    id: 'co_nomad_visa',
    name: 'Visa V de nómada digital',
    threshold: 730, // days max
    summary: 'Permite residir hasta 2 años. No es un régimen fiscal: a partir de 183 días eres residente fiscal colombiano.',
    requirements: ['Ingresos mínimos de 3 salarios mínimos mensuales', 'Trabajo remoto para empresas extranjeras'],
    source_url: 'https://www.cancilleria.gov.co/tramites_servicios/visa',
    verified_at: null,
  },
  {
    country: 'MX',
    rule: 'special_regime',
    id: 'mx_resico',
    name: 'RESICO (Régimen Simplificado de Confianza)',
    threshold: 3500000, // MXN
    summary: 'ISR del 1% al 2,5% sobre ingresos para residentes con ingresos < 3,5 M MXN.',
    requirements: ['Ser residente fiscal en México', 'Ingresos anuales inferiores a 3,5 M MXN'],
    source_url: 'https://www.sat.gob.mx/',
    verified_at: null,
  },
];

// ---------------------------------------------------------------------------
// Traps the app must WARN about (contexto.md §2 "Línea roja")
// ---------------------------------------------------------------------------
export const TRAPS = [
  {
    id: 'es_tax_haven',
    country: 'ES',
    rule: 'tax_haven_quarantine',
    threshold: 4,
    title: 'Mudanza a un paraíso fiscal',
    text: 'Si eres español y te trasladas a un paraíso fiscal, sigues siendo residente fiscal en España el año del cambio y los cuatro siguientes.',
    source_url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764#a8',
    verified_at: null,
  },
  {
    id: 'nowhere_resident',
    country: null,
    rule: 'no_residency',
    threshold: null,
    title: '"No ser residente en ningún sitio"',
    text: 'No es una opción real: si no superas 183 días en ningún país, Hacienda española suele seguir reclamándote por centro de intereses económicos o vínculos familiares.',
    source_url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764#a9',
    verified_at: null,
  },
  {
    id: 'foreign_company',
    country: 'ES',
    rule: 'place_of_effective_management',
    threshold: null,
    title: 'Sociedad extranjera gestionada desde España',
    text: 'Una sociedad extranjera (p. ej. una OÜ estonia) cuya dirección efectiva está en España puede tributar en España por el Impuesto sobre Sociedades.',
    source_url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2014-12328#a8',
    verified_at: null,
  },
  {
    id: 'exit_tax',
    country: 'ES',
    rule: 'exit_tax',
    threshold: 4000000,
    title: 'Impuesto de salida',
    text: 'Si tu cartera supera 4 M€ (o 1 M€ con más del 25% en una sociedad) y has sido residente 10 de los últimos 15 años, al irte tributas por las plusvalías latentes.',
    source_url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764#a95bis',
    verified_at: null,
  },
];

// ---------------------------------------------------------------------------
// Double taxation treaties among the 5 countries (in force, simplified)
// ---------------------------------------------------------------------------
export const TREATIES = [
  { countries: ['ES', 'PT'], in_force: true, source_url: 'https://www.hacienda.gob.es/es-ES/Normativa%20y%20doctrina/Normativa/CDI/Paginas/CDI_Alfabetico.aspx', verified_at: null },
  { countries: ['ES', 'MX'], in_force: true, source_url: 'https://www.hacienda.gob.es/es-ES/Normativa%20y%20doctrina/Normativa/CDI/Paginas/CDI_Alfabetico.aspx', verified_at: null },
  { countries: ['ES', 'CO'], in_force: true, source_url: 'https://www.hacienda.gob.es/es-ES/Normativa%20y%20doctrina/Normativa/CDI/Paginas/CDI_Alfabetico.aspx', verified_at: null },
  { countries: ['ES', 'TH'], in_force: true, source_url: 'https://www.hacienda.gob.es/es-ES/Normativa%20y%20doctrina/Normativa/CDI/Paginas/CDI_Alfabetico.aspx', verified_at: null },
  { countries: ['PT', 'MX'], in_force: true, source_url: 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/convencoes_evitar_dupla_tributacao/', verified_at: null },
  { countries: ['PT', 'CO'], in_force: true, source_url: 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/convencoes_evitar_dupla_tributacao/', verified_at: null },
  { countries: ['PT', 'TH'], in_force: false, source_url: 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/convencoes_evitar_dupla_tributacao/', verified_at: null },
  { countries: ['MX', 'CO'], in_force: true, source_url: 'https://www.sat.gob.mx/', verified_at: null },
  { countries: ['MX', 'TH'], in_force: false, source_url: 'https://www.sat.gob.mx/', verified_at: null },
  { countries: ['CO', 'TH'], in_force: false, source_url: 'https://www.dian.gov.co/', verified_at: null },
];

export const ALL_RULES = [
  ...RESIDENCY_RULES, ...INCOME_TAX_RULES, ...SOCIAL_SECURITY_RULES, ...VAT_RULES, ...SPECIAL_REGIMES, ...TRAPS,
];

// Sanity check at import time: no rule without source.
for (const r of ALL_RULES) {
  if (!r.source_url) throw new Error(`Rule without source_url: ${r.country}/${r.rule}`);
}
