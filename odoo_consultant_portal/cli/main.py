import asyncio
import click
import uvicorn
from rich.console import Console
from rich.table import Table
from pathlib import Path

console = Console()


@click.group()
@click.version_option()
def cli():
    """Odoo Consultant Portal — local web portal for Odoo consultants."""


@cli.command()
def init():
    """Initialize the portal (create data directory and database)."""
    from ..core.config import settings
    from ..core.database import init_db

    console.print(f"[bold green]Initializing portal...[/bold green]")
    console.print(f"Data directory: {settings.data_dir}")
    asyncio.run(init_db())
    console.print("[bold green]✓ Database initialized.[/bold green]")
    console.print("\nRun [bold]odoo-portal serve[/bold] to start the web UI.")


@cli.command()
@click.option("--host", default=None, help="Bind host (default: from config)")
@click.option("--port", default=None, type=int, help="Bind port (default: from config)")
@click.option("--reload", is_flag=True, default=False, help="Enable auto-reload (dev mode)")
def serve(host, port, reload):
    """Start the portal API and web UI."""
    from ..core.config import settings
    from ..core.database import init_db

    asyncio.run(init_db())
    _host = host or settings.api_host
    _port = port or settings.api_port
    console.print(f"[bold green]Starting portal at http://{_host}:{_port}[/bold green]")
    uvicorn.run(
        "odoo_consultant_portal.api.app:app",
        host=_host,
        port=_port,
        reload=reload,
    )


@cli.group()
def source():
    """Manage Odoo source repositories."""


@source.command("sync")
@click.option("--version", required=True, help="Odoo version (e.g. 17.0)")
@click.option("--path", required=True, type=click.Path(), help="Local directory path")
@click.option("--enterprise", is_flag=True, default=False, help="Also sync Enterprise (requires SSH)")
def source_sync(version, path, enterprise):
    """Clone or pull Odoo Community (and optionally Enterprise) sources."""
    from ..services.source_manager import (
        SUPPORTED_VERSIONS, clone_or_pull, test_github_ssh,
        COMMUNITY_REMOTE, ENTERPRISE_REMOTE,
    )

    if version not in SUPPORTED_VERSIONS and not version.startswith("custom"):
        console.print(f"[red]Unsupported version: {version}. Supported: {', '.join(SUPPORTED_VERSIONS)}[/red]")
        raise SystemExit(1)

    base = Path(path)
    console.print(f"[bold]Syncing Odoo {version} to {base}[/bold]")

    try:
        result = clone_or_pull(COMMUNITY_REMOTE, base / "community", version)
        console.print(f"[green]Community: {result['action']} → {result['path']} ({result['head']})[/green]")
    except Exception as exc:
        console.print(f"[red]Community sync failed: {exc}[/red]")

    if enterprise:
        if not test_github_ssh():
            console.print("[red]Enterprise requires SSH access to GitHub. No valid key found.[/red]")
        else:
            try:
                result = clone_or_pull(ENTERPRISE_REMOTE, base / "enterprise", version)
                console.print(f"[green]Enterprise: {result['action']} → {result['path']} ({result['head']})[/green]")
            except Exception as exc:
                console.print(f"[red]Enterprise sync failed: {exc}[/red]")


@cli.group()
def profile():
    """Manage Odoo.sh connection profiles."""


@profile.command("list")
def profile_list():
    """List all profiles."""
    from ..core.database import AsyncSessionLocal, init_db
    from ..core.models import Profile
    from sqlmodel import select

    async def _list():
        await init_db()
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Profile))
            profiles = result.scalars().all()
        return profiles

    profiles = asyncio.run(_list())
    if not profiles:
        console.print("No profiles configured. Use the web UI to add one.")
        return
    table = Table("ID", "Name", "DB URL", "Version")
    for p in profiles:
        table.add_row(str(p.id), p.name, p.db_url, p.odoo_version or "")
    console.print(table)


@cli.command("mcp")
def run_mcp():
    """Start the MCP server (stdio transport)."""
    from ..mcp.server import run_mcp_server
    asyncio.run(run_mcp_server())
