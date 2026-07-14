import asyncio
import json
import websockets

HOST = "0.0.0.0"
WS_PORT = 8790     # agent.py clients connect here (websocket)
HTTP_PORT = 8791   # ping-agent.mjs sends commands here (plain HTTP/JSON)

# machine_id (e.g. "VIP12") -> websocket connection
clients = {}


async def handler(websocket):
    ip = websocket.remote_address[0] if websocket.remote_address else "Unknown"
    machine = None

    try:
        hello_raw = await asyncio.wait_for(websocket.recv(), timeout=10)
        hello = json.loads(hello_raw)
        machine = str(hello.get("machine", "")).strip().upper()
    except Exception:
        machine = None

    if not machine:
        print(f"[!] Client from {ip} did not send a valid machine id — closing")
        await websocket.close()
        return

    clients[machine] = websocket
    print(f"[+] {machine} connected ({ip}) | Total : {len(clients)}")

    try:
        async for _ in websocket:
            pass
    except websockets.ConnectionClosed:
        pass
    finally:
        if clients.get(machine) is websocket:
            del clients[machine]
        print(f"[-] {machine} disconnected | Total : {len(clients)}")


async def send_warning_to(machine, reason, seconds):
    """Send a warning to exactly one connected client. Returns (ok, error)."""
    ws = clients.get(machine)
    if not ws:
        return False, f"{machine} is not connected"

    packet = json.dumps({
        "command": "show_warning",
        "reason": reason,
        "seconds": seconds,
    })

    try:
        await ws.send(packet)
        return True, None
    except Exception as e:
        clients.pop(machine, None)
        return False, str(e)


async def broadcast_warning(reason, seconds):
    if not clients:
        print("No Clients Connected.")
        return

    packet = json.dumps({
        "command": "show_warning",
        "reason": reason,
        "seconds": seconds,
    })

    dead = []
    for machine, ws in list(clients.items()):
        try:
            await ws.send(packet)
        except Exception:
            dead.append(machine)

    for m in dead:
        clients.pop(m, None)


async def console():
    """Manual fallback: type into this window to send a warning yourself.
    Leave VIP blank to broadcast to every connected client."""
    while True:
        try:
            target = await asyncio.to_thread(input, "\nVIP (blank = all) : ")
            reason = await asyncio.to_thread(input, "Reason : ")
            sec = await asyncio.to_thread(input, "Seconds : ")

            try:
                sec = int(sec)
            except Exception:
                sec = 30

            target = target.strip().upper()
            if target:
                ok, err = await send_warning_to(target, reason, sec)
                print(f"[✓] sent to {target}" if ok else f"[x] {err}")
            else:
                await broadcast_warning(reason, sec)
                print(f"[✓] broadcast to {len(clients)} client(s)")

        except KeyboardInterrupt:
            break


# ── Minimal HTTP command endpoint (no extra dependencies) ────────────────
# POST /send   body: {"machine": "VIP12", "reason": "...", "seconds": 15}
# This is what the dashboard's ping-agent.mjs calls so a click on one
# client's warning icon only reaches that one client.
async def handle_http(reader, writer):
    try:
        request_line = await reader.readline()
        if not request_line:
            return
        parts = request_line.decode(errors="ignore").split()
        method, path = (parts[0], parts[1]) if len(parts) >= 2 else ("", "")

        headers = {}
        while True:
            line = await reader.readline()
            if line in (b"\r\n", b""):
                break
            if b":" in line:
                k, v = line.decode(errors="ignore").split(":", 1)
                headers[k.strip().lower()] = v.strip()

        body = b""
        length = int(headers.get("content-length", "0") or "0")
        if length:
            body = await reader.readexactly(length)

        status = "404 Not Found"
        result = {"ok": False, "error": "not found"}

        if method == "OPTIONS":
            status = "204 No Content"
            result = None
        elif method == "POST" and path == "/send":
            try:
                data = json.loads(body or b"{}")
            except Exception:
                data = None

            if data is None:
                status = "400 Bad Request"
                result = {"ok": False, "error": "bad json"}
            else:
                machine = str(data.get("machine", "")).strip().upper()
                reason = str(data.get("reason", "اخطار مدیریت"))
                try:
                    seconds = int(data.get("seconds", 15))
                except Exception:
                    seconds = 15

                if not machine:
                    status = "400 Bad Request"
                    result = {"ok": False, "error": "machine required"}
                else:
                    ok, err = await send_warning_to(machine, reason, seconds)
                    status = "200 OK"
                    result = {"ok": ok, "error": err}

        payload = b"" if result is None else json.dumps(result).encode("utf-8")
        resp = (
            f"HTTP/1.1 {status}\r\n"
            f"Content-Type: application/json\r\n"
            f"Content-Length: {len(payload)}\r\n"
            f"Access-Control-Allow-Origin: *\r\n"
            f"Access-Control-Allow-Methods: POST, OPTIONS\r\n"
            f"Access-Control-Allow-Headers: Content-Type\r\n"
            f"Connection: close\r\n\r\n"
        ).encode("utf-8") + payload
        writer.write(resp)
        await writer.drain()
    except Exception as e:
        try:
            payload = json.dumps({"ok": False, "error": str(e)}).encode("utf-8")
            writer.write(
                (
                    "HTTP/1.1 500 Internal Server Error\r\n"
                    "Content-Type: application/json\r\n"
                    f"Content-Length: {len(payload)}\r\n"
                    "Connection: close\r\n\r\n"
                ).encode("utf-8")
                + payload
            )
            await writer.drain()
        except Exception:
            pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def main():
    async with websockets.serve(
        handler,
        HOST,
        WS_PORT,
        ping_interval=20,
        ping_timeout=20,
    ):
        http_server = await asyncio.start_server(handle_http, HOST, HTTP_PORT)
        print(f"Warning Server Started : ws {HOST}:{WS_PORT}  |  http {HOST}:{HTTP_PORT}")
        async with http_server:
            await console()


if __name__ == "__main__":
    asyncio.run(main())
