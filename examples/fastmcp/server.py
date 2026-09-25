"""Local background hashing; configure FASTMCP_DOCKET_URL for Redis recovery."""
import argparse
import asyncio
import hashlib

from fastmcp import FastMCP, Context
from mcp.types import InputRequiredResult
from fastmcp_tasks import TasksExtension

mcp = FastMCP("Batch hashing")
# Defaults to memory://; reuse the same backend URL and queue name on restart.
mcp.add_extension(TasksExtension())


@mcp.tool(task=True)
async def hash_batch(texts: list[str], delay_ms: int = 1000) -> dict:
    """Return ordered SHA-256 digests of UTF-8 text after a bounded work delay."""
    if not 0 <= delay_ms <= 10000 or len(texts) > 100:
        raise ValueError("Use at most 100 texts and a delay from 0 to 10000 ms")
    await asyncio.sleep(delay_ms / 1000)
    return {"digests": [hashlib.sha256(text.encode("utf-8")).hexdigest() for text in texts]}


@mcp.tool(task=True)
async def choose_label(ctx: Context):
    """Ask for a label, then return the explicit user choice on task re-entry."""
    answer = ctx.input_responses.get("label") if ctx.input_responses else None
    if answer is None:
        return InputRequiredResult(inputRequests={
            "label": {
                "method": "elicitation/create",
                "params": {
                    "mode": "form", "message": "Choose a label for this batch.",
                    "requestedSchema": {
                        "type": "object", "properties": {"label": {"type": "string"}},
                        "required": ["label"],
                    },
                },
            },
        })
    if answer.action != "accept":
        return {"action": answer.action}
    label = (answer.content or {}).get("label")
    if not isinstance(label, str):
        raise ValueError("An accepted response must contain a string label")
    return {"label": label}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    mcp.run(transport="http", host="127.0.0.1", port=args.port, json_response=True)
