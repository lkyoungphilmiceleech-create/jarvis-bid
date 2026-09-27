#!/usr/bin/env python3
"""HWP(5.x) 본문 텍스트 추출기. 사용: python hwp2txt.py 파일.hwp > 결과.txt
표 안의 글자도 문단 순서대로 나온다. 배포용(암호화) 문서는 지원하지 않는다."""
import struct
import sys
import zlib

import olefile

PARA_TEXT = 67
WIDE = {1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23}  # 8글자(16바이트) 차지하는 제어문자


def para_text(buf: bytes) -> str:
    out, i = [], 0
    while i + 1 < len(buf):
        c = struct.unpack_from("<H", buf, i)[0]
        if c in WIDE:
            i += 16
            if c == 9:
                out.append("\t")
            continue
        if c in (10, 13):
            out.append("\n")
        elif c >= 32:
            out.append(chr(c))
        i += 2
    return "".join(out)


def extract(path: str) -> str:
    ole = olefile.OleFileIO(path)
    header = ole.openstream("FileHeader").read()
    flags = struct.unpack_from("<I", header, 36)[0]
    if flags & 0x04:
        raise SystemExit("배포용(암호화) 문서라 읽을 수 없습니다.")
    compressed = bool(flags & 0x01)
    sections = sorted((e for e in ole.listdir() if e[0] == "BodyText"), key=lambda e: int(e[1][7:]))
    texts = []
    for sec in sections:
        data = ole.openstream(sec).read()
        if compressed:
            data = zlib.decompress(data, -15)
        i = 0
        while i + 4 <= len(data):
            h = struct.unpack_from("<I", data, i)[0]
            tag, size = h & 0x3FF, h >> 20
            i += 4
            if size == 0xFFF:
                size = struct.unpack_from("<I", data, i)[0]
                i += 4
            if tag == PARA_TEXT:
                t = para_text(data[i:i + size]).rstrip()
                if t:
                    texts.append(t)
            i += size
    return "\n".join(texts)


if __name__ == "__main__":
    sys.stdout.write(extract(sys.argv[1]) + "\n")
