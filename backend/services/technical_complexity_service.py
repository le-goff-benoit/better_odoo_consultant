import json
import asyncio
import ast
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from .studio_service import inspect_studio_customizations


MODE_LABELS = {
    "standard": "Pas de Studio ni Dev",
    "studio": "Studio uniquement",
    "dev": "Dev uniquement",
    "studio_dev": "Studio + Dev",
}

# Tokens to identify Odoo official authors. Use substring match because the
# manifest author field often includes extra text like "(https://www.odoo.com)"
# or email addresses that prevent exact-set membership. "odoo" alone is NOT
# included here because it matches "Odoo Community Association (OCA)" — handled
# by explicit equality in _is_odoo_author instead.
ODOO_AUTHOR_TOKENS = ("odoo s.a.", "odoo sa")

# Known community publishers — modules from these authors are NOT custom dev
# (they're standard community modules, like OCA addons). Treated separately
# so a project running OCA addons doesn't get flagged as "Dev".
COMMUNITY_AUTHOR_TOKENS = (
    "oca",
    "odoo community association",
    "camptocamp",
    "akretion",
    "tecnativa",
    "elico-corp", "elico corp",
    "agile business group", "agilebg",
    "trobz",
    "open source integrators", "osi",
    "openworx",
    "syleam",
    "savoir-faire linux", "savoir faire linux",
    "vauxoo",
    "ursa",
    "kmee",
    "noviat",
    "therp",
    "creu blanca",
    "coopiteasy", "coop it easy",
    "numigi",
    "moduon",
    "quartile",
    "smile",
    "subteno",
    "anubia",
)

# Module name prefixes that strongly suggest the module is OCA / community,
# regardless of the manifest author field.
COMMUNITY_NAME_PREFIXES = (
    "account_financial_report",
    "account_invoice_",
    "account_payment_",
    "account_reconcile_",
    "account_statement_",
    "base_rest",
    "base_technical_",
    "bank_statement_",
    "connector_",
    "edi_",
    "mis_",
    "mass_editing",
    "partner_",
    "queue_job",
    "report_xlsx",
    "report_qweb_",
    "sale_order_",
    "stock_picking_",
    "web_advanced_search",
    "web_responsive",
    "web_tree_",
    "web_widget_",
)

# Studio detection threshold. Signals are now restricted to genuine
# studio_customization records (see studio_service), so a single one already
# means Studio was used on this instance — no inflated threshold needed.
STUDIO_SIGNAL_THRESHOLD = 1

# Custom dev detection threshold (when no configured repo): any truly custom
# module (not Odoo, not OCA, not community) is enough to flag the project as
# having custom dev. The previous bug was treating OCA modules as custom; now
# that we filter community modules out, a single truly-custom module is
# meaningful.
CUSTOM_MODULE_THRESHOLD = 1

REPO_SCAN_EXCLUDED_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    "dist",
    "build",
}


def _is_odoo_author(author_lower: str) -> bool:
    # Empty author ≠ Odoo. Only treat as Odoo if the string actually names Odoo.
    if not author_lower:
        return False
    if author_lower == "odoo":
        return True
    return any(token in author_lower for token in ODOO_AUTHOR_TOKENS)


def _is_community_author(author_lower: str) -> bool:
    return any(token in author_lower for token in COMMUNITY_AUTHOR_TOKENS)


def _looks_like_community_module(name: str) -> bool:
    return any(name.startswith(prefix) for prefix in COMMUNITY_NAME_PREFIXES)


def _repo_local_path(profile_name: str, env_id: str) -> Path:
    return Path.home() / ".odoo-consultant" / "repos" / profile_name / env_id


def _is_excluded_repo_path(path: Path) -> bool:
    return any(part in REPO_SCAN_EXCLUDED_DIRS for part in path.parts)


def _read_manifest(path: Path) -> dict[str, Any]:
    try:
        value = ast.literal_eval(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return value if isinstance(value, dict) else {}


def _manifest_is_custom(path: Path) -> bool:
    manifest = _read_manifest(path)
    module_name = path.parent.name
    name = str(manifest.get("name") or module_name)
    author = str(manifest.get("author") or "").strip().lower()
    if module_name.startswith("l10n_") or name.lower().startswith("l10n_"):
        return False
    if author and (_is_odoo_author(author) or _is_community_author(author)):
        return False
    if _looks_like_community_module(module_name):
        return False
    return True


def _load_envs(environments: Optional[str]) -> list[dict[str, Any]]:
    try:
        value = json.loads(environments or "[]")
    except Exception:
        return []
    return value if isinstance(value, list) else []


def _count_studio_signals(studio: dict[str, Any]) -> dict[str, int]:
    return {
        "models": int(studio.get("custom_models", {}).get("count") or 0),
        "fields": int(studio.get("custom_fields", {}).get("count") or 0),
        "views": int(studio.get("studio_views", {}).get("count") or 0),
        "menus": int(studio.get("studio_menus", {}).get("count") or 0),
        "server_actions": int(studio.get("studio_server_actions", {}).get("count") or 0),
        "access_rules": int(studio.get("studio_access_rules", {}).get("count") or 0),
        "record_rules": int(studio.get("studio_record_rules", {}).get("count") or 0),
    }


def _repo_summary(profile_name: str, envs: list[dict[str, Any]], fallback_github_repo: Optional[str] = None) -> dict[str, Any]:
    repos: list[dict[str, Any]] = []
    total_manifests = 0
    total_python = 0
    total_xml = 0
    if not envs and fallback_github_repo:
        envs = [{"id": "prod", "name": "Production", "github_repo": fallback_github_repo}]
    elif fallback_github_repo and not any(env.get("github_repo") for env in envs):
        envs = [{**envs[0], "github_repo": fallback_github_repo}] + envs[1:]
    for env in envs:
        env_id = env.get("id") or "prod"
        github_repo = env.get("github_repo")
        if not github_repo:
            continue
        repo_path = _repo_local_path(profile_name, env_id)
        cloned = (repo_path / ".git").exists()
        manifests = [
            path for path in repo_path.rglob("__manifest__.py")
            if not _is_excluded_repo_path(path.relative_to(repo_path))
        ] if cloned else []
        custom_manifests = [path for path in manifests if _manifest_is_custom(path)]
        custom_dirs = [path.parent for path in custom_manifests]
        py_count = sum(1 for module_dir in custom_dirs for path in module_dir.rglob("*.py") if not _is_excluded_repo_path(path.relative_to(repo_path))) if cloned else 0
        xml_count = sum(1 for module_dir in custom_dirs for path in module_dir.rglob("*.xml") if not _is_excluded_repo_path(path.relative_to(repo_path))) if cloned else 0
        total_manifests += len(custom_manifests)
        total_python += py_count
        total_xml += xml_count
        repos.append({
            "env_id": env_id,
            "env_name": env.get("name") or env_id,
            "github_repo": github_repo,
            "cloned": cloned,
            "manifest_count": len(custom_manifests),
            "all_manifest_count": len(manifests),
            "ignored_manifest_count": len(manifests) - len(custom_manifests),
            "custom_modules": [path.parent.name for path in custom_manifests[:30]],
            "python_files": py_count,
            "xml_files": xml_count,
            "local_path": str(repo_path) if cloned else None,
        })
    return {
        "detected": total_manifests > 0,
        "configured": bool(repos),
        "repositories": repos,
        "manifest_count": total_manifests,
        "python_files": total_python,
        "xml_files": total_xml,
    }


def _mode(studio_detected: bool, dev_detected: bool) -> str:
    if studio_detected and dev_detected:
        return "studio_dev"
    if studio_detected:
        return "studio"
    if dev_detected:
        return "dev"
    return "standard"


def _confidence(studio_inspected: bool, studio_error: bool, dev_configured: bool, dev_detected: bool) -> str:
    # Studio can only be assessed against a live Odoo connection. With no
    # connection the whole Studio dimension is unknown, so never claim "high" —
    # a "standard" verdict here only means "no dev found", not "no Studio".
    if not studio_inspected:
        return "low"
    if studio_error:
        return "medium"
    # Repo configured but nothing detected: the scan is incomplete (repo not
    # cloned, or empty), so the dev signal is only partial.
    if dev_configured and not dev_detected:
        return "medium"
    return "high"


async def _installed_module_summary(odoo) -> dict[str, Any]:
    if odoo is None:
        return {"available": False, "module_count": 0, "studio_modules": [], "custom_modules": []}
    try:
        loop = asyncio.get_event_loop()
        modules = await loop.run_in_executor(None, odoo.get_installed_modules)
    except Exception as exc:
        return {
            "available": False,
            "module_count": 0,
            "studio_modules": [],
            "custom_modules": [],
            "error": str(exc),
        }

    custom_modules: list[str] = []
    community_modules: list[str] = []
    studio_modules: list[str] = []
    automation_modules: list[str] = []
    installed_apps: list[str] = []
    for module in modules:
        name = str(module.get("name") or "")
        author = str(module.get("author") or "").strip().lower()
        # Installed apps (application=True) — captured regardless of author so
        # the AI knows which Odoo apps actually run on this instance.
        if module.get("application"):
            installed_apps.append(str(module.get("shortdesc") or name))
        # studio_customization is generated by Studio and may carry a non-Odoo
        # author; without this continue it would be miscounted as custom dev
        # and flag a pure-Studio project as "Dev".
        if name in {"web_studio", "studio_customization"} or name.startswith("web_studio"):
            studio_modules.append(name)
            continue
        if name == "base_automation":
            automation_modules.append(name)
            continue
        if _is_odoo_author(author) or name.startswith("l10n_"):
            continue
        if _is_community_author(author) or _looks_like_community_module(name):
            community_modules.append(name)
            continue
        custom_modules.append(name)

    return {
        "available": True,
        "module_count": len(modules),
        "studio_modules": sorted(set(studio_modules)),
        # studio_customization being installed means Studio was actually USED
        # (web_studio alone only means Studio is available on the instance).
        "studio_customization_installed": "studio_customization" in studio_modules,
        "automation_modules": sorted(set(automation_modules)),
        "custom_modules": sorted(set(custom_modules))[:25],
        "custom_module_count": len(set(custom_modules)),
        "community_modules": sorted(set(community_modules))[:25],
        "community_module_count": len(set(community_modules)),
        "installed_apps": sorted(set(installed_apps)),
        "installed_app_count": len(set(installed_apps)),
    }


async def analyze_technical_complexity(profile_name: str, environments: Optional[str], odoo=None, fallback_github_repo: Optional[str] = None) -> dict[str, Any]:
    envs = _load_envs(environments)
    repo = _repo_summary(profile_name, envs, fallback_github_repo)
    installed_modules = await _installed_module_summary(odoo)
    studio_counts = {"models": 0, "fields": 0, "views": 0, "menus": 0, "server_actions": 0, "access_rules": 0, "record_rules": 0}
    studio_error = None
    studio_inspected = False
    if odoo is not None:
        try:
            studio = await inspect_studio_customizations(
                odoo,
                ["models", "fields", "views", "menus", "server_actions", "rules"],
            )
            studio_counts = _count_studio_signals(studio)
            studio_inspected = True
            # Individual sections swallow their own errors; surface them so a
            # partial failure lowers confidence instead of silently
            # under-counting signals.
            section_errors = [
                str(section["error"])
                for section in studio.values()
                if isinstance(section, dict) and section.get("error")
            ]
            if section_errors:
                studio_error = "; ".join(section_errors[:3])
        except Exception as exc:
            studio_error = str(exc)

    studio_total = sum(studio_counts.values())
    custom_module_count = installed_modules.get("custom_module_count") or 0
    odoo_connected = installed_modules.get("available", False)
    studio_module_used = bool(installed_modules.get("studio_customization_installed"))
    # A single genuine studio_customization record — or the studio_customization
    # module being installed — means Studio was actually used on this instance.
    studio_detected = studio_total >= STUDIO_SIGNAL_THRESHOLD or studio_module_used
    # When Odoo is reachable, the installed-modules list is authoritative:
    # a repo with manifests that aren't installed should not flag the project as "Dev".
    # When Odoo is not reachable, fall back to the repo scan as a best-effort signal.
    if odoo_connected:
        dev_detected = custom_module_count >= CUSTOM_MODULE_THRESHOLD
    else:
        dev_detected = bool(repo["detected"])
    mode = _mode(studio_detected, dev_detected)
    return {
        "mode": mode,
        "label": MODE_LABELS[mode],
        "confidence": _confidence(studio_inspected, bool(studio_error), bool(repo["configured"]), dev_detected),
        "studio": {
            "detected": studio_detected,
            "inspected": studio_inspected,
            "module_installed": studio_module_used,
            "signal_count": studio_total,
            "counts": studio_counts,
            "error": studio_error,
        },
        "dev": repo,
        "installed_modules": installed_modules,
        "checked_at": datetime.utcnow().isoformat(),
    }


def parse_technical_complexity(raw: Optional[str]) -> Optional[dict[str, Any]]:
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except Exception:
        return None
    return value if isinstance(value, dict) else None


def dump_technical_complexity(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False)


def complexity_mode_from_raw(raw: Optional[str]) -> Optional[str]:
    """Extract just the ``mode`` from a stored technical_complexity JSON —
    helper for callers that route context based on the project profile."""
    value = parse_technical_complexity(raw)
    if not value:
        return None
    mode = value.get("mode")
    return mode if isinstance(mode, str) else None


def build_project_context_block(
    raw: Optional[str],
    *,
    company_name: Optional[str] = None,
    company_city: Optional[str] = None,
    country_code: Optional[str] = None,
    country_name: Optional[str] = None,
) -> str:
    """Construit le bloc prioritaire « Contexte projet » qui conditionne la
    réflexion de l'IA à chaque tour : qui est le client, où il est, et quel
    est son profil technique (vanilla / Studio / dev / mixte + modules).

    Garanti non-tronqué (priority block, cap 6_000 chars).

    Si la complexité technique n'a jamais été calculée, le bloc le signale
    explicitement et invite à lancer le diagnostic — l'IA ne doit pas
    répondre comme si le projet était vanilla par défaut.
    """
    header: list[str] = ["## Contexte projet"]
    if company_name:
        line = f"- Client : **{company_name}**"
        if company_city:
            line += f" ({company_city})"
        header.append(line)
    if country_code or country_name:
        loc = country_name or country_code
        if country_code and country_name:
            loc = f"{country_name} ({country_code})"
        header.append(f"- Localisation fiscale : {loc}")
    value = parse_technical_complexity(raw)
    if not value:
        header.append(
            "- Complexité technique : **non calculée** — lancer le diagnostic "
            "depuis l'onglet Projet avant de raisonner sur les flux. "
            "En attendant, ne pas supposer que la base est vanilla : "
            "demander à l'utilisateur si Studio ou des modules custom "
            "sont présents avant de répondre sur un comportement métier."
        )
        return "\n".join(header)
    body = _build_complexity_body(value)
    return "\n".join(header + [""] + body)


def build_technical_complexity_context(raw: Optional[str]) -> str:
    """Variante legacy qui retourne uniquement la section Complexité avec son
    propre heading `## Complexité technique du projet`. Conservée pour les
    callers qui n'ont pas besoin du wrapper « Contexte projet » (Creator).
    """
    value = parse_technical_complexity(raw)
    if not value:
        return ""
    return "\n".join(["## Complexité technique du projet"] + _build_complexity_body(value))


def _build_complexity_body(value: dict[str, Any]) -> list[str]:
    """Retourne les bullet points du profil technique, **sans heading**.
    Le caller décide d'imbriquer ou de préfixer un titre.
    """
    mode = value.get("mode") or "standard"
    label = value.get("label") or MODE_LABELS.get(mode, mode)
    confidence = value.get("confidence") or "unknown"
    studio = value.get("studio") or {}
    dev = value.get("dev") or {}
    installed = value.get("installed_modules") or {}
    custom_module_count = installed.get("custom_module_count") or 0
    custom_modules = installed.get("custom_modules") or []
    community_module_count = installed.get("community_module_count") or 0
    community_modules = installed.get("community_modules") or []
    installed_apps = installed.get("installed_apps") or []
    # Old cached records predate the "inspected" flag — assume inspected.
    if studio.get("inspected", True):
        studio_line = (
            f"- Studio : {'présent' if studio.get('detected') else 'non détecté'}"
            f" ({studio.get('signal_count') or 0} signaux"
            f"{', module studio_customization installé' if studio.get('module_installed') else ''})"
        )
    else:
        studio_line = (
            "- Studio : non vérifié (Odoo non connecté lors de l'analyse) — "
            "ne pas conclure à l'absence de Studio"
        )
    lines = [
        f"- Profil technique : {label} (confiance : {confidence})",
        studio_line,
        f"- Développement custom : {'présent' if dev.get('detected') else 'non détecté'}"
        f" ({dev.get('manifest_count') or 0} manifests custom, {dev.get('python_files') or 0} fichiers Python, {dev.get('xml_files') or 0} fichiers XML)",
    ]
    ignored_manifests = sum(
        int(repo.get("ignored_manifest_count") or 0)
        for repo in (dev.get("repositories") or [])
        if isinstance(repo, dict)
    )
    if ignored_manifests:
        lines.append(f"- Manifests ignorés car non custom/Odoo/OCA/l10n : {ignored_manifests}")
    if custom_module_count:
        sample = ", ".join(custom_modules[:10])
        suffix = f" : {sample}" if sample else ""
        lines.append(f"- Modules custom installés : {custom_module_count}{suffix}")
    if community_module_count:
        sample = ", ".join(community_modules[:10])
        suffix = f" : {sample}" if sample else ""
        lines.append(f"- Modules communautaires (OCA / etc.) : {community_module_count}{suffix}")
    if installed_apps:
        sample = ", ".join(installed_apps[:30])
        more = "…" if len(installed_apps) > 30 else ""
        lines.append(
            f"- Apps Odoo installées sur l'instance ({len(installed_apps)}) : {sample}{more}"
        )
    if mode == "studio":
        lines.append("- Stratégie : inspecter Studio avant de proposer du code ; privilégier configuration, vues, actions et champs Studio, et en cas d'anomalie vérifier aussi les actions serveur, actions planifiées et automatisations.")
    elif mode == "dev":
        lines.append("- Stratégie : vérifier le repo client et les modules installés avant de conclure sur le standard Odoo.")
    elif mode == "studio_dev":
        lines.append("- Stratégie : identifier si le comportement vient du standard, de Studio ou du code custom avant de recommander une action ; sur un incident métier, contrôler aussi actions serveur, actions planifiées, automatisations et record rules.")
    else:
        lines.append("- Stratégie : proposer d'abord les options standard Odoo/configuration, puis demander confirmation avant d'inventer une couche Studio ou custom.")
    # Warn when repo has manifests but Odoo confirms no custom modules are installed.
    repo_has_manifests = (dev.get("manifest_count") or 0) > 0
    if repo_has_manifests and installed.get("available") and not custom_module_count:
        lines.append(
            "- Attention : le dépôt contient des modules custom "
            "mais aucun n'est installé sur l'instance Odoo connectée ; "
            "les modules repo peuvent être hors scope de cette instance."
        )
    if studio.get("error"):
        lines.append("- Attention : analyse Studio incomplète ; demander confirmation si la réponse dépend de Studio.")
    if installed.get("error"):
        lines.append("- Attention : liste des modules installés indisponible ; prudence sur les hypothèses de customisation.")
    return lines
