"""Minimal HTTP client using built-in socket + ssl.

Works on both MicroPython and CPython.
Uses HTTP/1.0 to avoid chunked transfer encoding complexity.
Inspired by micropython-lib/requests and SpotlightKid/mrequests.
"""

import json
import socket
import ssl


def post_json(url, headers=None, body=None):
    """HTTPS POST with JSON body, returns parsed JSON response."""
    # Parse URL
    try:
        proto, _, host, path = url.split("/", 3)
        path = "/" + path
    except ValueError:
        proto, _, host = url.split("/", 2)
        path = "/"

    port = 443 if proto == "https:" else 80
    if ":" in host:
        host, port = host.split(":", 1)
        port = int(port)

    data = json.dumps(body) if body else ""

    # Connect
    ai = socket.getaddrinfo(host, port, 0, socket.SOCK_STREAM)[0]
    sock = socket.socket(ai[0], socket.SOCK_STREAM, ai[2])
    try:
        sock.connect(ai[-1])
        if proto == "https:":
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            sock = ctx.wrap_socket(sock, server_hostname=host)

        # On MicroPython, ssl socket has read/write/readline directly.
        # On CPython, we need makefile() for readline support.
        if hasattr(sock, "readline"):
            sf = sock
        else:
            sf = sock.makefile("rwb")

        # Send request (HTTP/1.0 = no chunked responses)
        sf.write(b"POST %s HTTP/1.0\r\n" % path.encode())
        sf.write(b"Host: %s\r\n" % host.encode())
        sf.write(b"Content-Type: application/json\r\n")
        sf.write(b"Content-Length: %d\r\n" % len(data))
        sf.write(b"Connection: close\r\n")
        if headers:
            for k, v in headers.items():
                sf.write(("%s: %s\r\n" % (k, v)).encode())
        sf.write(b"\r\n")
        sf.write(data.encode())
        sf.flush()

        # Read status
        line = sf.readline()
        status = int(line.split(None, 2)[1])

        # Skip response headers
        while True:
            line = sf.readline()
            if not line or line == b"\r\n":
                break

        # Read body
        response_body = sf.read()
    except OSError:
        sock.close()
        raise

    sock.close()

    if status >= 400:
        raise OSError(f"HTTP {status}: {response_body[:200]}")

    return json.loads(response_body)
