// Human-readable, bilingual (FR/EN) metadata for AI tool calls.
// Shared by the Assistant and Migration pages so the user sees, in their
// language, what each tool is doing — not a raw tool name.
import { ODOO_APPS } from '../constants/odooApps'

type Lang = 'fr' | 'en'

export interface ToolMeta {
  icon: string
  appName: string | null
  color: string
  loadingLabel: string
  doneLabel: string
  liveDb?: boolean
}

// Human-readable labels for common Odoo models, in both languages.
const ODOO_MODEL_LABELS: Record<string, { fr: string; en: string }> = {
  // Accounting
  'account.move':               { fr: 'Factures', en: 'Invoices' },
  'account.move.line':          { fr: 'Lignes de facture', en: 'Invoice lines' },
  'account.payment':            { fr: 'Paiements', en: 'Payments' },
  'account.payment.term':       { fr: 'Conditions de paiement', en: 'Payment terms' },
  'account.analytic.line':      { fr: 'Lignes analytiques', en: 'Analytic lines' },
  'account.journal':            { fr: 'Journaux comptables', en: 'Accounting journals' },
  'account.account':            { fr: 'Plan comptable', en: 'Chart of accounts' },
  'account.tax':                { fr: 'Taxes', en: 'Taxes' },
  // Sales
  'sale.order':                 { fr: 'Commandes clients', en: 'Sales orders' },
  'sale.order.line':            { fr: 'Lignes de commande', en: 'Sale order lines' },
  'sale.report':                { fr: 'Analyse des ventes', en: 'Sales analysis' },
  'crm.lead':                   { fr: 'Opportunités CRM', en: 'CRM leads' },
  'crm.stage':                  { fr: 'Étapes CRM', en: 'CRM stages' },
  // Purchase
  'purchase.order':             { fr: 'Commandes fournisseurs', en: 'Purchase orders' },
  'purchase.order.line':        { fr: 'Lignes d\'achat', en: 'Purchase order lines' },
  // Inventory / Stock
  'stock.picking':              { fr: 'Transferts de stock', en: 'Stock transfers' },
  'stock.move':                 { fr: 'Mouvements de stock', en: 'Stock moves' },
  'stock.quant':                { fr: 'Niveaux de stock', en: 'Stock quantities' },
  'stock.warehouse':            { fr: 'Entrepôts', en: 'Warehouses' },
  'stock.location':             { fr: 'Emplacements', en: 'Locations' },
  'stock.route':                { fr: 'Routes de stock', en: 'Stock routes' },
  'stock.warehouse.orderpoint': { fr: 'Règles de réapprovisionnement', en: 'Reordering rules' },
  'stock.lot':                  { fr: 'Lots / Numéros de série', en: 'Lots / Serial numbers' },
  // Products
  'product.template':           { fr: 'Produits', en: 'Products' },
  'product.product':            { fr: 'Variantes de produit', en: 'Product variants' },
  'product.category':           { fr: 'Catégories de produit', en: 'Product categories' },
  'product.pricelist':          { fr: 'Listes de prix', en: 'Pricelists' },
  // Partners
  'res.partner':                { fr: 'Contacts', en: 'Contacts' },
  'res.company':                { fr: 'Sociétés', en: 'Companies' },
  'res.users':                  { fr: 'Utilisateurs', en: 'Users' },
  // HR
  'hr.employee':                { fr: 'Employés', en: 'Employees' },
  'hr.leave':                   { fr: 'Congés', en: 'Time off' },
  'hr.leave.allocation':        { fr: 'Allocations de congés', en: 'Time off allocations' },
  'hr.payslip':                 { fr: 'Bulletins de salaire', en: 'Payslips' },
  'hr.contract':                { fr: 'Contrats', en: 'Contracts' },
  // Project
  'project.project':            { fr: 'Projets', en: 'Projects' },
  'project.task':               { fr: 'Tâches', en: 'Tasks' },
  'project.task.type':          { fr: 'Étapes des tâches', en: 'Task stages' },
  // Manufacturing
  'mrp.production':             { fr: 'Ordres de fabrication', en: 'Manufacturing orders' },
  'mrp.bom':                    { fr: 'Nomenclatures', en: 'Bills of materials' },
  'mrp.workcenter':             { fr: 'Postes de travail', en: 'Work centers' },
  // Other
  'ir.rule':                    { fr: 'Règles d\'accès', en: 'Record rules' },
  'ir.model':                   { fr: 'Modèles techniques', en: 'Technical models' },
  'ir.model.fields':            { fr: 'Champs techniques', en: 'Technical fields' },
  'ir.ui.view':                 { fr: 'Vues', en: 'Views' },
  'ir.actions.report':          { fr: 'Rapports', en: 'Reports' },
  'res.currency':               { fr: 'Devises', en: 'Currencies' },
  'res.country':                { fr: 'Pays', en: 'Countries' },
  'uom.uom':                    { fr: 'Unités de mesure', en: 'Units of measure' },
  'mail.message':               { fr: 'Messages', en: 'Messages' },
  'mail.activity':              { fr: 'Activités', en: 'Activities' },
}

export function humanModel(model: string, lang: Lang): string {
  const entry = ODOO_MODEL_LABELS[model]
  return entry ? entry[lang] : model
}

function shorten(text: string, max = 28): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** Returns icon + colour + bilingual loading/done labels for a tool call. */
export function getToolMeta(
  name: string,
  args: Record<string, unknown> | undefined,
  lang: Lang,
): ToolMeta {
  const fr = lang === 'fr'

  if (name === 'odoo_query_records') {
    const model = (args?.model as string) ?? ''
    const prefix = model.split('.')[0]
    const app = ODOO_APPS[prefix]
    const label = humanModel(model, lang)
    return {
      icon: app ? app.icon : '🗄️', appName: app ? prefix : null,
      color: app ? app.color : '#64748b',
      loadingLabel: model
        ? (fr ? `Requête base client — ${label}…` : `Querying client database — ${label}…`)
        : (fr ? 'Requête base client…' : 'Querying client database…'),
      doneLabel: label || 'Odoo', liveDb: true,
    }
  }
  if (name === 'odoo_count_records') {
    const model = (args?.model as string) ?? ''
    const label = humanModel(model, lang)
    return {
      icon: '🔢', appName: null, color: '#0891b2',
      loadingLabel: model
        ? (fr ? `Comptage — ${label}…` : `Counting — ${label}…`)
        : (fr ? 'Comptage…' : 'Counting…'),
      doneLabel: model ? (fr ? `Comptage · ${label}` : `Count · ${label}`) : (fr ? 'Comptage' : 'Count'),
      liveDb: true,
    }
  }
  if (name === 'odoo_inspect_fields') {
    const model = (args?.model as string) ?? ''
    const label = humanModel(model, lang)
    return {
      icon: '🔬', appName: null, color: '#059669',
      loadingLabel: model
        ? (fr ? `Champs — ${label}…` : `Fields — ${label}…`)
        : (fr ? 'Découverte des champs…' : 'Discovering fields…'),
      doneLabel: model ? (fr ? `Champs · ${label}` : `Fields · ${label}`) : (fr ? 'Champs' : 'Fields'),
    }
  }
  if (name === 'odoo_aggregate_records') {
    const model = (args?.model as string) ?? ''
    const label = humanModel(model, lang)
    return {
      icon: '∑', appName: null, color: '#0f766e',
      loadingLabel: model
        ? (fr ? `Agrégation — ${label}…` : `Aggregating — ${label}…`)
        : (fr ? 'Agrégation des données…' : 'Aggregating data…'),
      doneLabel: model ? (fr ? `Agrégats · ${label}` : `Aggregates · ${label}`) : (fr ? 'Agrégats' : 'Aggregates'),
      liveDb: true,
    }
  }
  if (name === 'odoo_inspect_modules') {
    return {
      icon: '▦', appName: null, color: '#2563eb',
      loadingLabel: fr ? 'Lecture des modules installés…' : 'Reading installed modules…',
      doneLabel: fr ? 'Modules installés' : 'Installed modules',
      liveDb: true,
    }
  }
  if (name === 'odoo_inspect_security') {
    const model = (args?.model as string) ?? ''
    const label = humanModel(model, lang)
    return {
      icon: '🔐', appName: null, color: '#be123c',
      loadingLabel: fr ? `Sécurité — ${label || model}…` : `Security — ${label || model}…`,
      doneLabel: fr ? `Sécurité · ${label || model}` : `Security · ${label || model}`,
      liveDb: true,
    }
  }
  if (name === 'odoo_inspect_navigation') {
    const model = (args?.model as string) ?? ''
    const query = (args?.query as string) ?? ''
    const scope = model ? humanModel(model, lang) : query
    return {
      icon: '🧭', appName: null, color: '#0891b2',
      loadingLabel: fr ? `Menus et actions${scope ? ` — ${scope}` : ''}…` : `Menus and actions${scope ? ` — ${scope}` : ''}…`,
      doneLabel: fr ? `Menus${scope ? ` · ${scope}` : ''}` : `Menus${scope ? ` · ${scope}` : ''}`,
      liveDb: true,
    }
  }
  if (name === 'source_search_odoo') {
    const ver = args?.version as string
    const pat = shorten((args?.pattern as string) ?? '')
    const verSuffix = ver ? ` v${ver}` : ''
    return {
      icon: '🔍', appName: null, color: '#2563EB',
      loadingLabel: fr ? `Recherche sources${verSuffix}…` : `Searching sources${verSuffix}…`,
      doneLabel: pat
        ? (fr ? `« ${pat} » dans sources${verSuffix}` : `“${pat}” in sources${verSuffix}`)
        : (fr ? `Sources Odoo${verSuffix}` : `Odoo sources${verSuffix}`),
    }
  }
  if (name === 'source_read_odoo_file') {
    const file = ((args?.path as string) ?? '').split('/').pop() || (fr ? 'fichier' : 'file')
    return {
      icon: '📄', appName: null, color: '#2563EB',
      loadingLabel: fr ? `Lecture — ${file}…` : `Reading — ${file}…`, doneLabel: file,
    }
  }
  if (name === 'migration_search_target_source') {
    const ver = args?.version as string
    const pat = shorten((args?.pattern as string) ?? '')
    const verSuffix = ver ? ` v${ver}` : ''
    return {
      icon: '🎯', appName: null, color: '#9333ea',
      loadingLabel: fr ? `Recherche sources cibles${verSuffix}…` : `Searching target sources${verSuffix}…`,
      doneLabel: pat
        ? (fr ? `« ${pat} » dans sources${verSuffix}` : `“${pat}” in sources${verSuffix}`)
        : (fr ? `Sources cible${verSuffix}` : `Target sources${verSuffix}`),
    }
  }
  if (name === 'migration_read_target_file') {
    const file = ((args?.path as string) ?? '').split('/').pop() || (fr ? 'fichier' : 'file')
    return {
      icon: '📄', appName: null, color: '#9333ea',
      loadingLabel: fr ? `Lecture sources cibles — ${file}…` : `Reading target sources — ${file}…`,
      doneLabel: file,
    }
  }
  if (name === 'repo_search_code') {
    const pat = shorten((args?.pattern as string) ?? '')
    return {
      icon: '⎇', appName: null, color: '#0891b2',
      loadingLabel: fr ? 'Recherche dans le code custom…' : 'Searching custom code…',
      doneLabel: pat
        ? (fr ? `« ${pat} » dans code custom` : `“${pat}” in custom code`)
        : (fr ? 'Code custom' : 'Custom code'),
    }
  }
  if (name === 'repo_read_file') {
    const file = ((args?.path as string) ?? '').split('/').pop() || (fr ? 'fichier' : 'file')
    return {
      icon: '📁', appName: null, color: '#0891b2',
      loadingLabel: fr ? `Lecture code custom — ${file}…` : `Reading custom code — ${file}…`,
      doneLabel: file,
    }
  }
  if (name === 'repo_list_modules') {
    return {
      icon: '▦', appName: null, color: '#D97706',
      loadingLabel: fr ? 'Inventaire des modules projet…' : 'Inventorying project modules…',
      doneLabel: fr ? 'Modules projet' : 'Project modules',
    }
  }
  if (name === 'repo_count_source_lines') {
    const scope = (args?.scope as string) ?? ''
    const path = (args?.path as string) ?? ''
    const groupBy = (args?.group_by as string) ?? 'extension'
    const groupByLabels: Record<string, { fr: string; en: string }> = {
      extension: { fr: 'par type', en: 'by type' },
      module: { fr: 'par module', en: 'by module' },
      directory: { fr: 'par dossier', en: 'by folder' },
      none: { fr: 'total', en: 'total' },
    }
    const scopeLabels: Record<string, { fr: string; en: string }> = {
      odoo: { fr: 'sources Odoo', en: 'Odoo sources' },
      target: { fr: 'sources cible', en: 'target sources' },
      project: { fr: 'code custom', en: 'custom code' },
    }
    const scopeLbl = scopeLabels[scope]?.[lang] ?? scope
    const grpLbl = groupByLabels[groupBy]?.[lang] ?? groupBy
    const pathSuffix = path ? ` / ${path}` : ''
    return {
      icon: '📊', appName: null, color: '#0EA5E9',
      loadingLabel: fr ? `Volumétrie — ${scopeLbl}${pathSuffix}…` : `Line count — ${scopeLbl}${pathSuffix}…`,
      doneLabel: fr
        ? `Volumétrie · ${scopeLbl}${pathSuffix} (${grpLbl})`
        : `Line count · ${scopeLbl}${pathSuffix} (${grpLbl})`,
    }
  }
  if (name === 'odoo_inspect_studio') {
    const sections = (args?.sections as string[]) ?? ['all']
    const sectLabel = sections.includes('all') ? (fr ? 'tout' : 'all') : sections.join(', ')
    const modelFilter = (args?.model_filter as string) ?? ''
    const filterSuffix = modelFilter ? ` · ${modelFilter}` : ''
    return {
      icon: '🎨', appName: null, color: '#7C3AED',
      loadingLabel: fr
        ? `Inspection Studio — ${sectLabel}${modelFilter ? ` (${modelFilter})` : ''}…`
        : `Studio inspection — ${sectLabel}${modelFilter ? ` (${modelFilter})` : ''}…`,
      doneLabel: fr ? `Personnalisations Studio${filterSuffix}` : `Studio customizations${filterSuffix}`,
      liveDb: true,
    }
  }
  if (name === 'odoo_inspect_view') {
    const model = (args?.model as string) ?? ''
    const label = humanModel(model, lang)
    const vt = (args?.view_type as string) ?? ''
    return {
      icon: '🪟', appName: null, color: '#0d9488',
      loadingLabel: fr
        ? `Inspection de la vue${vt ? ` ${vt}` : ''}${model ? ` — ${label}` : ''}…`
        : `Inspecting the${vt ? ` ${vt}` : ''} view${model ? ` — ${label}` : ''}…`,
      doneLabel: fr
        ? `Vue${vt ? ` ${vt}` : ''}${model ? ` · ${label}` : ''}`
        : `${vt ? `${vt} ` : ''}view${model ? ` · ${label}` : ''}`,
      liveDb: true,
    }
  }
  if (name === 'odoo_inspect_report') {
    const reportName = (args?.report_name as string) ?? ''
    const model = (args?.model as string) ?? ''
    const scope = reportName || (model ? humanModel(model, lang) : '')
    const scopeSuffix = scope ? ` — ${scope}` : ''
    return {
      icon: '🧾', appName: null, color: '#b45309',
      loadingLabel: fr ? `Inspection des rapports PDF${scopeSuffix}…` : `Inspecting PDF reports${scopeSuffix}…`,
      doneLabel: fr
        ? `Rapports PDF${scope ? ` · ${scope}` : ''}`
        : `PDF reports${scope ? ` · ${scope}` : ''}`,
      liveDb: true,
    }
  }
  return {
    icon: '⚙️', appName: null, color: '#64748b',
    loadingLabel: `${name}…`, doneLabel: name,
  }
}
