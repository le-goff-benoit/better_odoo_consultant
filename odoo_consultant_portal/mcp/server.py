"""MCP server skeleton for read-only Odoo access."""
from mcp.server import Server
from mcp.server.models import InitializationOptions
from mcp.types import Tool, Resource, Prompt, TextContent
import mcp.server.stdio

server = Server("odoo-consultant-portal")


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="odoo_search",
            description="Search and read records from an Odoo model (read-only)",
            inputSchema={
                "type": "object",
                "properties": {
                    "profile": {"type": "string", "description": "Profile name"},
                    "model": {"type": "string", "description": "Odoo model (e.g. res.partner)"},
                    "domain": {"type": "array", "description": "Search domain", "default": []},
                    "fields": {"type": "array", "items": {"type": "string"}, "description": "Fields to return"},
                    "limit": {"type": "integer", "default": 80},
                },
                "required": ["profile", "model"],
            },
        ),
        Tool(
            name="odoo_fields",
            description="Inspect fields of an Odoo model (read-only)",
            inputSchema={
                "type": "object",
                "properties": {
                    "profile": {"type": "string"},
                    "model": {"type": "string"},
                },
                "required": ["profile", "model"],
            },
        ),
        Tool(
            name="odoo_modules",
            description="List installed Odoo modules (read-only)",
            inputSchema={
                "type": "object",
                "properties": {"profile": {"type": "string"}},
                "required": ["profile"],
            },
        ),
    ]


@server.list_resources()
async def list_resources() -> list[Resource]:
    return [
        Resource(uri="odoo://models", name="Odoo Models", description="Available Odoo models", mimeType="application/json"),
        Resource(uri="odoo://modules", name="Installed Modules", description="Installed Odoo modules", mimeType="application/json"),
        Resource(uri="odoo://recent-queries", name="Recent Queries", description="Recent query history", mimeType="application/json"),
    ]


@server.list_prompts()
async def list_prompts() -> list[Prompt]:
    return [
        Prompt(name="analyze-model", description="Analyze an Odoo model schema and suggest queries"),
        Prompt(name="export-workflow", description="Guide through exporting Odoo data to CSV/Excel/Markdown"),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    # Stub: real implementation connects via OdooClient using profile from DB
    return [TextContent(type="text", text=f"Tool '{name}' called with {arguments}. Connect portal API for real data.")]


async def run_mcp_server():
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, InitializationOptions(server_name="odoo-consultant-portal", server_version="0.1.0"))
