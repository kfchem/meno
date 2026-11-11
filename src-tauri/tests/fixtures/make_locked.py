"""Writes locked.pdf: a one-page PDF with made-up content, locked with a user password
(the standard security handler, revision 2: RC4, 40-bit key), for the tests of pdf.rs.

    python3 make_locked.py            # writes locked.pdf here

Its user password is "meno-test", its owner password "meno-owner".
"""
import hashlib
import struct

PAD = bytes.fromhex("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A")
USER, OWNER = b"meno-test", b"meno-owner"
P = -4
ID = bytes(range(16))


def rc4(key: bytes, data: bytes) -> bytes:
    s = list(range(256))
    j = 0
    for i in range(256):
        j = (j + s[i] + key[i % len(key)]) % 256
        s[i], s[j] = s[j], s[i]
    out, i, j = bytearray(), 0, 0
    for b in data:
        i = (i + 1) % 256
        j = (j + s[i]) % 256
        s[i], s[j] = s[j], s[i]
        out.append(b ^ s[(s[i] + s[j]) % 256])
    return bytes(out)


pad = lambda pw: (pw + PAD)[:32]
O = rc4(hashlib.md5(pad(OWNER)).digest()[:5], pad(USER))
key = hashlib.md5(pad(USER) + O + struct.pack("<i", P) + ID).digest()[:5]
U = rc4(key, PAD)


def encrypted(num: int, data: bytes) -> bytes:
    return rc4(hashlib.md5(key + struct.pack("<I", num)[:3] + b"\0\0").digest()[:10], data)


hexed = lambda b: "<" + b.hex() + ">"
content = encrypted(4, b"BT /F1 14 Tf 72 700 Td (Made-up locked page) Tj ET")
objs = {
    1: b"<< /Type /Catalog /Pages 2 0 R >>",
    2: b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    4: b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
    5: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    6: f"<< /Filter /Standard /V 1 /R 2 /O {hexed(O)} /U {hexed(U)} /P {P} >>".encode(),
}
out = b"%PDF-1.4\n"
at = {}
for n, body in objs.items():
    at[n] = len(out)
    out += b"%d 0 obj\n" % n + body + b"\nendobj\n"
xref = len(out)
out += b"xref\n0 7\n0000000000 65535 f \n" + b"".join(b"%010d 00000 n \n" % at[n] for n in range(1, 7))
out += f"trailer\n<< /Size 7 /Root 1 0 R /Encrypt 6 0 R /ID [{hexed(ID)} {hexed(ID)}] >>\nstartxref\n{xref}\n%%EOF\n".encode()
open("locked.pdf", "wb").write(out)
