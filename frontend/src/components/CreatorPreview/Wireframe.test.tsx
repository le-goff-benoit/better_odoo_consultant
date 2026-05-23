import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { FieldValue, ViewWireframe } from './Wireframe'
import { NO_ADD } from './wireframeUtils'

describe('FieldValue', () => {
  it('renders a checkmark for true boolean', () => {
    const { container } = render(<FieldValue kind="boolean" value={true} />)
    expect(container.textContent).toContain('✓')
  })
  it('renders the many2one display name', () => {
    const { container } = render(<FieldValue kind="many2one" value={[7, 'Partner Co']} />)
    expect(container.textContent).toContain('Partner Co')
  })
  it('renders nothing for an empty Odoo value', () => {
    const { container } = render(<FieldValue kind="char" value={false} />)
    expect(container.textContent).toBe('')
  })
  it('renders the selection label, not the raw value', () => {
    const info = {
      type: 'selection',
      selection: [['draft', 'Brouillon'], ['sale', 'Confirmé']] as Array<[unknown, string]>,
    }
    const { container } = render(<FieldValue kind="selection" value="draft" info={info} />)
    expect(container.textContent).toContain('Brouillon')
    expect(container.textContent).not.toContain('draft')
  })
})

describe('ViewWireframe', () => {
  it('shows a hint when arch is empty', () => {
    const { container } = render(<ViewWireframe arch="" added={NO_ADD} />)
    expect(container.textContent).toContain('Vue indisponible')
  })
  it('shows a hint when arch fails to parse', () => {
    const { container } = render(<ViewWireframe arch="<not xml" added={NO_ADD} />)
    expect(container.textContent).toContain('illisible')
  })
  it('renders a simple form view with a sample value', () => {
    const arch = `<form>
      <sheet>
        <group>
          <field name="partner_id"/>
          <field name="amount_total"/>
        </group>
      </sheet>
    </form>`
    const sampleValues = { partner_id: [7, 'Acme Corp'], amount_total: 1234 }
    const { container } = render(
      <ViewWireframe arch={arch} added={NO_ADD} sampleValues={sampleValues} />,
    )
    expect(container.textContent).toContain('Acme Corp')
    expect(container.textContent).toContain('1234')
  })
  it('marks an added field with the "nouveau" badge', () => {
    const arch = `<form><sheet><group><field name="x_new"/></group></sheet></form>`
    const added = { fields: new Set(['x_new']), pages: new Set<string>() }
    const { container } = render(<ViewWireframe arch={arch} added={added} />)
    expect(container.textContent?.toLowerCase()).toContain('nouveau')
  })
  it('renders a list view with column headers from arch', () => {
    const arch = `<list>
      <field name="partner_id"/>
      <field name="amount_total"/>
    </list>`
    const { container } = render(<ViewWireframe arch={arch} added={NO_ADD} />)
    // labels are humanized from the field names
    expect(container.textContent).toContain('Partner')
    expect(container.textContent).toContain('Amount total')
  })
})
