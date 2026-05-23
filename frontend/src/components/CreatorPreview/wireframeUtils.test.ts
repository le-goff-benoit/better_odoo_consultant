import { describe, expect, it } from 'vitest'
import {
  collectNames,
  comparableValue,
  evalCondition,
  evalDomainNode,
  evalInlineExpression,
  fieldKind,
  humanize,
  isHiddenForSample,
  kindFromOdooType,
  parseArch,
  parseMaybeObject,
  selectionLabel,
  statusbarSteps,
  valueText,
  visibilityState,
} from './wireframeUtils'

function $(xml: string): Element {
  const root = parseArch(xml)
  if (!root) throw new Error('failed to parse arch in test fixture')
  return root
}

describe('humanize', () => {
  it('strips x_ prefix and _id suffix and capitalizes', () => {
    expect(humanize('x_partner_id')).toBe('Partner')
    expect(humanize('amount_total')).toBe('Amount total')
    expect(humanize('')).toBe('')
  })
})

describe('parseArch / collectNames', () => {
  it('returns null on invalid xml', () => {
    expect(parseArch('<not xml')).toBeNull()
  })
  it('extracts field and page names', () => {
    const arch = `<form>
      <field name="partner_id"/>
      <notebook>
        <page string="Lignes"><field name="line_ids"/></page>
        <page string="Notes"/>
      </notebook>
    </form>`
    const { fields, pages } = collectNames(arch)
    expect([...fields].sort()).toEqual(['line_ids', 'partner_id'])
    expect([...pages].sort()).toEqual(['Lignes', 'Notes'])
  })
})

describe('parseMaybeObject', () => {
  it('parses python-like domains into JSON', () => {
    expect(parseMaybeObject("[('state', '=', 'draft')]")).toEqual([['state', '=', 'draft']])
    expect(parseMaybeObject('{"invisible": True}')).toEqual({ invisible: true })
    expect(parseMaybeObject(null)).toBeNull()
  })
})

describe('comparableValue', () => {
  it('returns the id part of an Odoo many2one tuple', () => {
    expect(comparableValue([7, 'Partner'])).toBe(7)
  })
  it('returns false for empty arrays (Odoo convention)', () => {
    expect(comparableValue([])).toBe(false)
  })
})

describe('evalCondition', () => {
  const sample = { state: 'draft', amount: 100, partner_id: [7, 'X'] }
  it('=, !=, in, not in', () => {
    expect(evalCondition(['state', '=', 'draft'], sample)).toBe(true)
    expect(evalCondition(['state', '!=', 'draft'], sample)).toBe(false)
    expect(evalCondition(['state', 'in', ['draft', 'sent']], sample)).toBe(true)
    expect(evalCondition(['state', 'not in', ['sale']], sample)).toBe(true)
  })
  it('numeric comparisons', () => {
    expect(evalCondition(['amount', '>', 50], sample)).toBe(true)
    expect(evalCondition(['amount', '<=', 100], sample)).toBe(true)
  })
  it('compares many2one by id', () => {
    expect(evalCondition(['partner_id', '=', 7], sample)).toBe(true)
  })
})

describe('evalDomainNode', () => {
  const sample = { state: 'draft', amount: 100 }
  it('handles | (or) and & (and) operators', () => {
    expect(evalDomainNode(['|', ['state', '=', 'draft'], ['amount', '>', 999]], sample)).toBe(true)
    expect(evalDomainNode(['&', ['state', '=', 'sale'], ['amount', '>', 0]], sample)).toBe(false)
  })
  it('handles ! (not)', () => {
    expect(evalDomainNode(['!', ['state', '=', 'sale']], sample)).toBe(true)
  })
})

describe('evalInlineExpression', () => {
  it('handles literal truthy/falsy', () => {
    expect(evalInlineExpression('0', {})).toBe(false)
    expect(evalInlineExpression('True', {})).toBe(true)
  })
  it('handles bare field name as truthiness check', () => {
    expect(evalInlineExpression('partner_id', { partner_id: [7, 'X'] })).toBe(true)
    expect(evalInlineExpression('partner_id', { partner_id: false })).toBe(false)
  })
  it('handles "field == value" syntax', () => {
    expect(evalInlineExpression("state == 'draft'", { state: 'draft' })).toBe(true)
  })
})

describe('visibilityState / isHiddenForSample', () => {
  it('returns hidden when invisible="1"', () => {
    const el = $('<form><field name="x" invisible="1"/></form>').querySelector('field')!
    expect(visibilityState(el)).toBe('hidden')
    expect(isHiddenForSample(el)).toBe(true)
  })
  it('evaluates conditional domain from attrs against sample', () => {
    const el = $(`<form><field name="x" attrs="{'invisible': [('state', '=', 'draft')]}"/></form>`)
      .querySelector('field')!
    expect(visibilityState(el, { state: 'draft' })).toBe('hidden')
    expect(visibilityState(el, { state: 'sale' })).toBe('visible')
  })
  it('returns conditional when sample missing', () => {
    const el = $(`<form><field name="x" invisible="not partner_id"/></form>`).querySelector('field')!
    // unparseable expression → conditional
    expect(visibilityState(el)).toBe('conditional')
  })
})

describe('kindFromOdooType / fieldKind', () => {
  it('maps odoo types to FieldKind', () => {
    expect(kindFromOdooType('boolean')).toBe('boolean')
    expect(kindFromOdooType('many2many')).toBe('tags')
    expect(kindFromOdooType('monetary')).toBe('numeric')
    expect(kindFromOdooType('datetime')).toBe('date')
    expect(kindFromOdooType('unknown')).toBeNull()
  })
  it('widget wins over heuristics', () => {
    const el = $('<form><field name="amount" widget="boolean_toggle"/></form>').querySelector('field')!
    expect(fieldKind(el)).toBe('boolean')
  })
  it('fields_get metadata wins over name heuristics', () => {
    const el = $('<form><field name="amount"/></form>').querySelector('field')!
    expect(fieldKind(el, { amount: { type: 'char' } })).toBe('char')
  })
  it('falls back to name heuristics', () => {
    const m2o = $('<form><field name="partner_id"/></form>').querySelector('field')!
    expect(fieldKind(m2o)).toBe('many2one')
    const tags = $('<form><field name="line_ids"/></form>').querySelector('field')!
    expect(fieldKind(tags)).toBe('tags')
    const date = $('<form><field name="invoice_date"/></form>').querySelector('field')!
    expect(fieldKind(date)).toBe('date')
  })
})

describe('selectionLabel / valueText', () => {
  const info = { type: 'selection', selection: [['draft', 'Brouillon'], ['sale', 'Confirmé']] as Array<[unknown, string]> }
  it('selectionLabel finds the label', () => {
    expect(selectionLabel('draft', info)).toBe('Brouillon')
    expect(selectionLabel('other', info)).toBeNull()
  })
  it('valueText renders selection via label', () => {
    expect(valueText('draft', 'selection', info)).toBe('Brouillon')
  })
  it('valueText renders many2one as the display name', () => {
    expect(valueText([7, 'Partner Co'], 'many2one')).toBe('Partner Co')
  })
  it('valueText truncates long strings', () => {
    const long = 'x'.repeat(100)
    expect(valueText(long, 'char').length).toBe(72)
  })
  it('valueText returns empty string for Odoo-empty values', () => {
    expect(valueText(false, 'char')).toBe('')
    expect(valueText(null, 'char')).toBe('')
  })
})

describe('statusbarSteps', () => {
  it('uses selection metadata filtered by statusbar_visible', () => {
    const field = $('<form><field name="state" statusbar_visible="draft,sale"/></form>')
      .querySelector('field')!
    const steps = statusbarSteps(field, {
      state: {
        selection: [['draft', 'Brouillon'], ['sent', 'Envoyé'], ['sale', 'Confirmé']] as Array<[unknown, string]>,
      },
    })
    expect(steps.map(s => s.value)).toEqual(['draft', 'sale'])
    expect(steps.map(s => s.label)).toEqual(['Brouillon', 'Confirmé'])
  })
  it('falls back to default values when no selection given', () => {
    const steps = statusbarSteps(undefined)
    expect(steps.map(s => s.value)).toEqual(['draft', 'sent', 'sale'])
  })
})
