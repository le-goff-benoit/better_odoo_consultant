import accountSvg      from '../assets/odoo-apps/account.svg'
import saleSvg         from '../assets/odoo-apps/sale.svg'
import purchaseSvg     from '../assets/odoo-apps/purchase.svg'
import stockSvg        from '../assets/odoo-apps/stock.svg'
import mrpSvg          from '../assets/odoo-apps/mrp.svg'
import projectSvg      from '../assets/odoo-apps/project.svg'
import hrSvg           from '../assets/odoo-apps/hr.svg'
import hrPayrollSvg    from '../assets/odoo-apps/hr_payroll.svg'
import crmSvg          from '../assets/odoo-apps/crm.svg'
import websiteSvg      from '../assets/odoo-apps/website.svg'
import posSvg          from '../assets/odoo-apps/point_of_sale.svg'
import helpdeskSvg     from '../assets/odoo-apps/helpdesk.svg'
import timesheetSvg    from '../assets/odoo-apps/hr_timesheet.svg'
import expenseSvg      from '../assets/odoo-apps/hr_expense.svg'
import signSvg         from '../assets/odoo-apps/sign.svg'
import fleetSvg        from '../assets/odoo-apps/fleet.svg'
import maintenanceSvg  from '../assets/odoo-apps/maintenance.svg'
import qualitySvg      from '../assets/odoo-apps/quality_control.svg'
import marketingSvg    from '../assets/odoo-apps/email_marketing.svg'

export interface AppDef {
  icon: string      // emoji fallback
  iconUrl: string   // local SVG
  label: string
  color: string
}

export const ODOO_APPS: Record<string, AppDef> = {
  account:         { icon: '💰', iconUrl: accountSvg,     label: 'Comptabilité',    color: '#875A7B' },
  accountant:      { icon: '💰', iconUrl: accountSvg,     label: 'Comptabilité',    color: '#875A7B' },
  accounting:      { icon: '💰', iconUrl: accountSvg,     label: 'Comptabilité',    color: '#875A7B' },
  sale:            { icon: '🛒', iconUrl: saleSvg,        label: 'Ventes',          color: '#00A09D' },
  purchase:        { icon: '🛍️', iconUrl: purchaseSvg,    label: 'Achats',          color: '#F06050' },
  stock:           { icon: '📦', iconUrl: stockSvg,       label: 'Inventaire',      color: '#F06050' },
  inventory:       { icon: '📦', iconUrl: stockSvg,       label: 'Inventaire',      color: '#F06050' },
  mrp:             { icon: '🏭', iconUrl: mrpSvg,         label: 'Fabrication',     color: '#E47D2B' },
  manufacturing:   { icon: '🏭', iconUrl: mrpSvg,         label: 'Fabrication',     color: '#E47D2B' },
  project:         { icon: '📋', iconUrl: projectSvg,     label: 'Projets',         color: '#00A09D' },
  hr:              { icon: '👥', iconUrl: hrSvg,          label: 'RH',              color: '#00A09D' },
  hr_payroll:      { icon: '💶', iconUrl: hrPayrollSvg,   label: 'Paie',            color: '#00A09D' },
  crm:             { icon: '🎯', iconUrl: crmSvg,         label: 'CRM',             color: '#F06050' },
  website:         { icon: '🌐', iconUrl: websiteSvg,     label: 'Site Web',        color: '#00A09D' },
  point_of_sale:   { icon: '🖥️', iconUrl: posSvg,         label: 'Point de Vente',  color: '#00A09D' },
  helpdesk:        { icon: '🎧', iconUrl: helpdeskSvg,    label: 'Support',         color: '#00A09D' },
  hr_timesheet:    { icon: '⏱️', iconUrl: timesheetSvg,   label: 'Timesheets',      color: '#00A09D' },
  hr_expense:      { icon: '💳', iconUrl: expenseSvg,     label: 'Notes de frais',  color: '#00A09D' },
  sign:            { icon: '✍️', iconUrl: signSvg,        label: 'Signature',       color: '#00A09D' },
  fleet:           { icon: '🚗', iconUrl: fleetSvg,       label: 'Flotte',          color: '#00A09D' },
  maintenance:     { icon: '⚙️', iconUrl: maintenanceSvg, label: 'Maintenance',     color: '#E47D2B' },
  quality_control: { icon: '✅', iconUrl: qualitySvg,     label: 'Qualité',         color: '#00A09D' },
  email_marketing: { icon: '📧', iconUrl: marketingSvg,   label: 'Marketing',       color: '#F06050' },
}
