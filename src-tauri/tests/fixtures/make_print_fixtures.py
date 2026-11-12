"""Writes the made-up PDFs the permission tests (src-tauri/src/pdf.rs `printing`) read: one page each, its words
made up, encrypted by the standard security handler (revision 3, RC4 128-bit) with an empty user password, so each
opens as any PDF does, and an owner password (made up) that holds what it is allowed.

    python3 -I make_print_fixtures.py <folder to write them to>

printing-allowed.pdf (print, and print in high quality), printing-low.pdf (print, not in high quality) and
printing-forbidden.pdf (no printing). Reading the permissions is all they are for."""

import hashlib
import struct
import sys

PAD = bytes.fromhex("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A")
ID = bytes.fromhex("00112233445566778899aabbccddeeff")
OWNER = b"owner-made-up"


def rc4(key, data):
    s = list(range(256))
    j = 0
    for i in range(256):
        j = (j + s[i] + key[i % len(key)]) % 256
        s[i], s[j] = s[j], s[i]
    out, i, j = bytearray(), 0, 0
    for byte in data:
        i = (i + 1) % 256
        j = (j + s[i]) % 256
        s[i], s[j] = s[j], s[i]
        out.append(byte ^ s[(s[i] + s[j]) % 256])
    return bytes(out)


def owner_entry():
    h = hashlib.md5((OWNER + PAD)[:32]).digest()
    for _ in range(50):
        h = hashlib.md5(h).digest()
    key = h[:16]
    out = rc4(key, PAD)
    for i in range(1, 20):
        out = rc4(bytes(b ^ i for b in key), out)
    return out


def file_key(o, p):
    h = hashlib.md5(PAD + o + struct.pack("<i", p) + ID).digest()
    for _ in range(50):
        h = hashlib.md5(h[:16]).digest()
    return h[:16]


def user_entry(key):
    out = rc4(key, hashlib.md5(PAD + ID).digest())
    for i in range(1, 20):
        out = rc4(bytes(b ^ i for b in key), out)
    return out + bytes(16)


def pdf(p):
    o = owner_entry()
    key = file_key(o, p)
    u = user_entry(key)
    words = b"BT /F1 24 Tf 72 700 Td (A page made up for a test) Tj ET"
    page_key = hashlib.md5(key + struct.pack("<I", 4)[:3] + b"\x00\x00").digest()[:16]
    stream = rc4(page_key, words)
    objs = [
        (1, b"<< /Type /Catalog /Pages 2 0 R >>"),
        (2, b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
        (3, b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"),
        (4, b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream"),
        (5, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
        (6, b"<< /Filter /Standard /V 2 /R 3 /Length 128 /P %d /O <%s> /U <%s> >>" % (p, o.hex().encode(), u.hex().encode())),
    ]
    out = bytearray(b"%PDF-1.7\n")
    at = {}
    for n, body in objs:
        at[n] = len(out)
        out += b"%d 0 obj\n" % n + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 7\n0000000000 65535 f \n"
    for n in range(1, 7):
        out += b"%010d 00000 n \n" % at[n]
    out += b"trailer\n<< /Size 7 /Root 1 0 R /Encrypt 6 0 R /ID [<%s> <%s>] >>\nstartxref\n%d\n%%%%EOF\n" % (ID.hex().encode(), ID.hex().encode(), xref)
    return bytes(out)


# (bits 7 and 8 and 13 up are set, as the format has them; print = bit 3, print in high quality = bit 12)
BASE = 0xFFFFF0C0 | 0x38 | 0x100 | 0x200 | 0x400
PRINT, HIGH = 0x4, 0x800


def signed(n):
    return n - (1 << 32) if n >= 1 << 31 else n


if __name__ == "__main__":
    here = sys.argv[1]
    for name, bits in (("allowed", BASE | PRINT | HIGH), ("low", BASE | PRINT), ("forbidden", BASE)):
        with open(f"{here}/printing-{name}.pdf", "wb") as f:
            f.write(pdf(signed(bits)))
