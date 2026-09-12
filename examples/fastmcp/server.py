"""Local background batch hashing service; keep running during client restarts."""
import argparse
import asyncio
import hashlib

from fastmcp import FastMCP
from fastmcp_tasks import TasksExtension

mcp = FastMCP("Batch hashing")
mcp.add_extension(TasksExtension(url="memory://"))


@mcp.tool(task=True)
async def hash_batch(texts: list[str], delay_ms: int = 1000) -> dict:
    """Return ordered SHA-256 digests of UTF-8 text after a bounded work delay."""
    if not 0 <= delay_ms <= 10000 or len(texts) > 100:
        raise ValueError("Use at most 100 texts and a delay from 0 to 10000 ms")
    await asyncio.sleep(delay_ms / 1000)
    return {"digests": [hashlib.sha256(text.encode("utf-8")).hexdigest() for text in texts]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    mcp.run(transport="http", host="127.0.0.1", port=args.port, json_response=True)
