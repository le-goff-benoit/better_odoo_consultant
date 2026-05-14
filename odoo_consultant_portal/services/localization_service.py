import asyncio
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Optional


_L10N_RE = re.compile(r"^l10n_([a-z]{2})(?:_|$)")
_LOCALIZATION_SIGNAL_TERMS = (
    "account.move",
    "account.tax",
    "bvr",
    "chart of accounts",
    "compta",
    "comptabil",
    "devise",
    "factur",
    "fec",
    "fiscal",
    "impôt",
    "intrastat",
    "journal",
    "localisation",
    "localization",
    "plan comptable",
    "qr-bill",
    "qr bill",
    "tax",
    "taxe",
    "tva",
    "vat",
)
_BUSINESS_SIGNAL_TERMS = (
    "achat",
    "account",
    "compta",
    "factur",
    "invoice",
    "payment",
    "paiement",
    "pos",
    "purchase",
    "sale",
    "vente",
)
_FUNCTIONAL_PERSPECTIVES = {"functional", "support", "business_analyst"}


def parse_company_cache(company_ids: Optional[str]) -> list[dict[str, Any]]:
    if not company_ids:
        return []
    try:
        value = json.loads(company_ids)
    except Exception:
        return []
    return value if isinstance(value, list) else []


def dump_company_cache(companies: list[dict[str, Any]]) -> str:
    return json.dumps(companies, ensure_ascii=False)


def _module_country_code(module_name: str) -> Optional[str]:
    match = _L10N_RE.match(module_name or "")
    return match.group(1).upper() if match else None


def _m2o_id(value: Any) -> Optional[int]:
    if isinstance(value, (list, tuple)) and value:
        try:
            return int(value[0])
        except Exception:
            return None
    if isinstance(value, int):
        return value
    return None


def _m2o_name(value: Any) -> Optional[str]:
    if isinstance(value, (list, tuple)) and len(value) > 1:
        return str(value[1]) if value[1] else None
    if isinstance(value, str):
        return value
    return None


def _source_roots(version: Optional[str], sources_base: Optional[Path] = None) -> list[tuple[str, Path, Path]]:
    if not version:
        return []
    base = sources_base or Path.home() / ".odoo-consultant" / "sources"
    roots: list[tuple[str, Path, Path]] = []
    community_root = base / version
    community_addons = community_root / "addons"
    if community_addons.is_dir():
        roots.append(("community", community_root, community_addons))
    enterprise_root = base / f"{version}-enterprise"
    if enterprise_root.is_dir():
        roots.append(("enterprise", enterprise_root, enterprise_root))
    return roots


def find_available_l10n_modules(
    version: Optional[str],
    country_code: Optional[str] = None,
    sources_base: Optional[Path] = None,
) -> list[dict[str, str]]:
    wanted_prefix = f"l10n_{country_code.lower()}" if country_code else "l10n_"
    found: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for source, root, module_parent in _source_roots(version, sources_base):
        for child in sorted(module_parent.iterdir()):
            if not child.is_dir() or not child.name.startswith(wanted_prefix):
                continue
            key = (source, child.name)
            if key in seen:
                continue
            seen.add(key)
            rel = child.relative_to(root)
            found.append({"name": child.name, "source": source, "path": str(rel)})
    return found


async def detect_company_localizations(client, version: Optional[str]) -> list[dict[str, Any]]:
    loop = asyncio.get_event_loop()

    try:
        company_fields = await loop.run_in_executor(None, lambda: client.fields_get("res.company", ["string", "type"]))
    except Exception:
        company_fields = {}

    optional_company_fields = [
        "city",
        "country_id",
        "account_fiscal_country_id",
        "currency_id",
        "chart_template",
    ]
    fields = ["id", "name"] + [field for field in optional_company_fields if field in company_fields]

    try:
        companies = await loop.run_in_executor(
            None,
            lambda: client.search_read("res.company", [], fields, limit=80),
        )
    except Exception:
        companies = []

    country_ids = {
        cid
        for company in companies
        for cid in (
            _m2o_id(company.get("account_fiscal_country_id")),
            _m2o_id(company.get("country_id")),
        )
        if cid
    }
    countries_by_id: dict[int, dict[str, Any]] = {}
    if country_ids:
        try:
            countries = await loop.run_in_executor(
                None,
                lambda: client.search_read("res.country", [["id", "in", list(country_ids)]], ["code", "name"], limit=250),
            )
            countries_by_id = {int(country["id"]): country for country in countries if country.get("id")}
        except Exception:
            countries_by_id = {}

    try:
        installed_raw = await loop.run_in_executor(
            None,
            lambda: client.search_read(
                "ir.module.module",
                [["state", "=", "installed"], ["name", "like", "l10n_"]],
                ["name", "shortdesc"],
                limit=500,
            ),
        )
    except Exception:
        installed_raw = []
    installed_names = sorted({m.get("name") for m in installed_raw if _module_country_code(str(m.get("name") or ""))})

    enriched: list[dict[str, Any]] = []
    checked_at = datetime.utcnow().isoformat()
    for company in companies:
        fiscal_country_id = _m2o_id(company.get("account_fiscal_country_id")) or _m2o_id(company.get("country_id"))
        country = countries_by_id.get(fiscal_country_id or -1, {})
        country_code = (country.get("code") or "").upper() or None
        country_name = country.get("name") or _m2o_name(company.get("account_fiscal_country_id")) or _m2o_name(company.get("country_id"))
        country_modules = [
            name for name in installed_names
            if country_code and name.startswith(f"l10n_{country_code.lower()}")
        ]
        available = find_available_l10n_modules(version, country_code)
        inferred = False

        if not country_code:
            candidate_codes = sorted({
                code for code in (
                    _module_country_code(name) for name in installed_names
                ) if code
            })
            if len(candidate_codes) == 1:
                country_code = candidate_codes[0]
                country_modules = [name for name in installed_names if name.startswith(f"l10n_{country_code.lower()}")]
                available = find_available_l10n_modules(version, country_code)
                inferred = True

        enriched.append({
            "id": company.get("id"),
            "name": company.get("name") or "",
            "city": company.get("city") or None,
            "country_code": country_code,
            "country_name": country_name,
            "country_inferred": inferred,
            "currency": _m2o_name(company.get("currency_id")),
            "chart_template": company.get("chart_template") or None,
            "installed_l10n_modules": country_modules if country_code else installed_names,
            "available_l10n_modules": available,
            "localization_checked_at": checked_at,
        })

    return enriched


def merge_company_localizations(existing: Optional[str], enriched: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {company.get("id"): dict(company) for company in parse_company_cache(existing) if company.get("id") is not None}
    result: list[dict[str, Any]] = []
    for company in enriched:
        base = by_id.get(company.get("id"), {})
        base.update({k: v for k, v in company.items() if v is not None})
        result.append(base)
    return result


def active_company_from_cache(company_ids: Optional[str], active_company_id: Optional[int]) -> Optional[dict[str, Any]]:
    companies = parse_company_cache(company_ids)
    if not companies:
        return None
    if active_company_id is not None:
        for company in companies:
            if company.get("id") == active_company_id:
                return company
    return companies[0]


def _has_signal(text: str, terms: tuple[str, ...]) -> bool:
    haystack = (text or "").lower()
    return any(term in haystack for term in terms)


def _format_module_list(modules: list[Any], max_items: int = 12) -> str:
    if not modules:
        return "aucun détecté"
    names = []
    for module in modules[:max_items]:
        if isinstance(module, dict):
            source = module.get("source")
            name = module.get("name")
            names.append(f"{name} ({source})" if source and name else str(name or module))
        else:
            names.append(str(module))
    suffix = f", +{len(modules) - max_items}" if len(modules) > max_items else ""
    return ", ".join(names) + suffix


def build_localization_context(
    company_ids: Optional[str],
    active_company_id: Optional[int],
    version: Optional[str],
    user_prompt: str,
    perspective: Optional[str],
) -> str:
    company = active_company_from_cache(company_ids, active_company_id)
    if not company:
        return ""

    installed = company.get("installed_l10n_modules") or []
    available = company.get("available_l10n_modules") or []
    country_code = company.get("country_code")
    has_localization = bool(country_code or installed or available)
    if not has_localization:
        return ""

    perspective_key = (perspective or "").strip()
    strong_relevance = _has_signal(user_prompt, _LOCALIZATION_SIGNAL_TERMS)
    strong_relevance = strong_relevance or (
        perspective_key in _FUNCTIONAL_PERSPECTIVES
        and _has_signal(user_prompt, _BUSINESS_SIGNAL_TERMS)
    )
    relevant = bool(country_code) or strong_relevance
    if not relevant:
        return ""

    country_label = "inconnu"
    if country_code:
        country_label = f"{company.get('country_name') or country_code} ({country_code})"
        if company.get("country_inferred"):
            country_label += " - inféré via les modules l10n"

    lines = [
        "## Localisation fiscale - société active",
        f"- Société active : {company.get('name') or 'inconnue'}",
        f"- Pays fiscal : {country_label}",
    ]
    if company.get("currency"):
        lines.append(f"- Devise : {company['currency']}")
    if company.get("chart_template"):
        lines.append(f"- Template / plan comptable : {company['chart_template']}")
    if strong_relevance:
        lines.extend([
            f"- Modules l10n installés : {_format_module_list(installed)}",
            f"- Modules l10n disponibles dans les sources v{version or '?'} : {_format_module_list(available)}",
            "- Instruction : pour toute réponse comptable, fiscale, facture, TVA, reporting légal ou POS certifié, vérifier les modules de localisation disponibles dans les sources Community et Enterprise avant de conclure.",
        ])
    else:
        lines.append("- Instruction : tenir compte du pays fiscal si la demande touche ensuite la comptabilité, les taxes, la facturation ou le reporting légal.")
    if not country_code and installed:
        lines.append("- Attention : pays fiscal non lu directement depuis la société ; demander confirmation si la réponse dépend d'une législation nationale.")
    return "\n".join(lines)
