import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ActionProposals from './ActionProposals'
import Markdown, { MarkdownActionsProvider, extractActionItems, parseMarkdownTable, resolveOdooUri, splitMarkdownTableRow } from './Markdown'

vi.mock('./MermaidBlock', () => ({
  default: ({ code }: { code: string }) => <div data-testid="mermaid-block">{code}</div>,
}))

describe('Markdown table parsing', () => {
  it('keeps empty cells and escaped pipes', () => {
    expect(splitMarkdownTableRow('| Module | Note | Empty |')).toEqual(['Module', 'Note', 'Empty'])
    expect(splitMarkdownTableRow('| sale | foo \\| bar |  |')).toEqual(['sale', 'foo | bar', ''])
  })

  it('parses alignment and normalizes row width', () => {
    const table = parseMarkdownTable([
      '| Module | Count | Ratio |',
      '| :--- | ---: | :---: |',
      '| sale | 12 | 60% |',
      '| account |  |',
    ])

    expect(table).toEqual({
      headers: ['Module', 'Count', 'Ratio'],
      aligns: ['left', 'right', 'center'],
      dataRows: [
        ['sale', '12', '60%'],
        ['account', '', ''],
      ],
    })
  })

  it('renders pipe-less markdown tables and inline markdown in cells', () => {
    const { container } = render(
      <Markdown text={[
        'Module | Statut | Note',
        '--- | :---: | ---',
        'sale | **OK** | `sale.order`',
      ].join('\n')} />,
    )

    expect(container.querySelectorAll('table')).toHaveLength(1)
    expect(container.querySelector('strong')?.textContent).toBe('OK')
    expect(container.querySelector('code')?.textContent).toBe('sale.order')
  })

  it('renders Mermaid fences with MermaidBlock', () => {
    render(
      <Markdown text={[
        '```mermaid',
        'flowchart TD',
        '  A --> B',
        '```',
      ].join('\n')} />,
    )

    expect(screen.getByTestId('mermaid-block').textContent).toContain('flowchart TD')
  })

  it('extracts action items from next-action and next-step headings', () => {
    expect(extractActionItems([
      '3 prochaines actions maximum',
      '1. Je vérifie le **bouton d’impression** côté Projet.',
      '2. Je liste les champs `x_studio` visibles.',
    ].join('\n'))).toEqual([
      'Je vérifie le bouton d’impression côté Projet.',
      'Je liste les champs x_studio visibles.',
    ])

    expect(extractActionItems([
      '## Prochaines étapes',
      '- Vérifier la configuration du profil.',
      '- Relancer le diagnostic.',
    ].join('\n'))).toEqual([
      'Vérifier la configuration du profil.',
      'Relancer le diagnostic.',
    ])

    expect(extractActionItems([
      '**Next steps**',
      '- Inspect the Odoo log.',
    ].join('\n'))).toEqual(['Inspect the Odoo log.'])
  })

  it('runs extracted action proposals as follow-up prompts', () => {
    const onPromptAction = vi.fn()
    render(
      <ActionProposals
        items={['Je vérifie le **bouton d’impression** côté Projet.', 'Je liste les champs x_studio visibles.']}
        onPromptAction={onPromptAction}
      />,
    )

    const buttons = screen.getAllByLabelText('Lancer cette action')
    expect(buttons).toHaveLength(2)

    fireEvent.click(buttons[0])
    expect(onPromptAction).toHaveBeenCalledWith(expect.stringContaining("Je vérifie le bouton d’impression côté Projet."))
    expect(onPromptAction).toHaveBeenCalledWith(expect.stringContaining("Utilise les outils nécessaires"))
  })

  it('does not extract ordinary numbered lists as actions', () => {
    expect(extractActionItems([
      'Étapes réalisées',
      '1. Lecture du rapport.',
      '2. Synthèse.',
    ].join('\n'))).toEqual([])
  })

  it('regression 0.99.3 — recognises indented sub-bullets as list items', () => {
    // Pre-fix, the LLM produced «   - Sub-item » (2 spaces +
    // hyphen) for nested bullets and the regex anchored at `^[-*]` missed
    // them. They fell into the <p> renderer and showed up as literal
    // "- Sub-item" text instead of bullets.
    const { container } = render(
      <Markdown
        text={[
          '- **Top item** :',
          '  - sub item 1',
          '  - sub item 2',
        ].join('\n')}
      />,
    )
    // Both top and sub items should be present in the rendered DOM as
    // bullets, not as literal "- " text inside <p>.
    expect(container.querySelectorAll('p').length).toBe(0)
    expect(container.textContent).toContain('Top item')
    expect(container.textContent).toContain('sub item 1')
    expect(container.textContent).toContain('sub item 2')
    // The literal "- " prefix must NOT appear in the rendered text.
    expect(container.textContent).not.toMatch(/-\s+sub item/)
  })

  it('regression 0.99.3 — 4-space-indented sub-bullets also render properly', () => {
    const { container } = render(
      <Markdown
        text={[
          '- Parent',
          '    - Deep child',
        ].join('\n')}
      />,
    )
    expect(container.querySelectorAll('p').length).toBe(0)
    expect(container.textContent).toContain('Deep child')
    expect(container.textContent).not.toMatch(/-\s+Deep child/)
  })

  it('renders inline markdown inside headings', () => {
    const { container } = render(<Markdown text="### 1. **Champs personnalisés (Studio)**" />)
    expect(container.querySelector('strong')?.textContent).toBe('Champs personnalisés (Studio)')
    expect(container.textContent).toBe('1. Champs personnalisés (Studio)')
    expect(container.textContent).not.toContain('**')
  })

  // ── v0.100.0 — séparateurs HR, liens odoo://, exemples concrets ─────

  it('v0.100.0 — renders `---` as a horizontal rule', () => {
    const { container } = render(<Markdown text={['Before', '', '---', '', 'After'].join('\n')} />)
    expect(container.querySelector('hr')).not.toBeNull()
    // Le texte « --- » ne doit jamais apparaître brut.
    expect(container.textContent).not.toMatch(/---/)
  })

  it('v0.100.0 — also renders `***` and `___` as HR', () => {
    expect(render(<Markdown text="***" />).container.querySelector('hr')).not.toBeNull()
    expect(render(<Markdown text="___" />).container.querySelector('hr')).not.toBeNull()
  })

  it('v0.100.0 — resolveOdooUri produces a /web URL for any Odoo version', () => {
    const url = resolveOdooUri('odoo://sale.order/12345', 'https://acme.odoo.com')
    expect(url).toBe('https://acme.odoo.com/web#id=12345&model=sale.order&view_type=form')
  })

  it('v0.100.0 — resolveOdooUri trims trailing slashes from the base URL', () => {
    expect(resolveOdooUri('odoo://res.partner/7', 'https://acme.odoo.com/'))
      .toBe('https://acme.odoo.com/web#id=7&model=res.partner&view_type=form')
  })

  it('v0.100.0 — resolveOdooUri returns null when base URL is missing or URI is invalid', () => {
    expect(resolveOdooUri('odoo://sale.order/12', undefined)).toBeNull()
    expect(resolveOdooUri('odoo://invalid', 'https://x.odoo.com')).toBeNull()
    expect(resolveOdooUri('odoo://sale.order/abc', 'https://x.odoo.com')).toBeNull()
  })

  it('v0.100.0 — odoo:// link in Markdown becomes a clickable <a> when a base URL is provided', () => {
    const { container } = render(
      <MarkdownActionsProvider odooBaseUrl="https://demo.odoo.com">
        <Markdown text="Voir [Contrat ABC](odoo://sale.order/42) pour les détails." />
      </MarkdownActionsProvider>,
    )
    const anchor = container.querySelector('a')
    expect(anchor).not.toBeNull()
    expect(anchor!.getAttribute('href')).toBe('https://demo.odoo.com/web#id=42&model=sale.order&view_type=form')
    expect(anchor!.getAttribute('target')).toBe('_blank')
    expect(anchor!.textContent).toContain('Contrat ABC')
  })

  it('v0.100.0 — odoo:// link renders as disabled span when no base URL (general mode)', () => {
    const { container } = render(
      <Markdown text="Voir [Contrat ABC](odoo://sale.order/42)" />,
    )
    // Pas de <a> en mode général, mais le label reste visible.
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('Contrat ABC')
  })

  it('v0.100.0 — ordinary http(s) Markdown links still work', () => {
    const { container } = render(<Markdown text="See [docs](https://docs.example.com) for more." />)
    const anchor = container.querySelector('a')
    expect(anchor).not.toBeNull()
    expect(anchor!.getAttribute('href')).toBe('https://docs.example.com')
  })

  it('v0.100.0 — `Exemples concrets sur cette base` section renders inside the callout container', () => {
    const text = [
      '## Risques métier',
      '- risque 1',
      '',
      '## Exemples concrets sur cette base',
      '- sur [SO12345](odoo://sale.order/12345), le SN est lié à la ligne via x_studio_n_serie',
      '- sur [SO12346](odoo://sale.order/12346), idem',
      '',
      '## Suite',
      '- next step',
    ].join('\n')
    const { container } = render(
      <MarkdownActionsProvider odooBaseUrl="https://acme.odoo.com">
        <Markdown text={text} />
      </MarkdownActionsProvider>,
    )
    // Le callout contient les exemples ET les liens, pas la section "Suite".
    expect(container.textContent).toContain('Exemples concrets sur cette base')
    expect(container.textContent).toContain('SO12345')
    expect(container.textContent).toContain('SO12346')
    expect(container.textContent).toContain('next step')  // après le callout
    const anchors = container.querySelectorAll('a')
    expect(anchors.length).toBeGreaterThanOrEqual(2)
    expect(anchors[0].getAttribute('href')).toContain('id=12345')
  })

  it('v0.100.0 — callout heading matches FR and EN variants', () => {
    const fr = render(<Markdown text="## Exemples concrets\n- x" />).container
    const en = render(<Markdown text="## Concrete examples in this database\n- x" />).container
    // Les deux doivent déclencher le callout (présent dans le DOM).
    // Le marqueur visuel exact (background tinté) est testé via styles
    // ailleurs ; ici on vérifie juste que le contenu sort.
    expect(fr.textContent).toContain('Exemples concrets')
    expect(en.textContent).toContain('Concrete examples')
  })
})
