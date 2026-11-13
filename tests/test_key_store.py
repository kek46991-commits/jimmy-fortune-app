import base64
import json

import pytest

from key_store import ApiKeyStore, KeyStoreError, _to_bytes


class FakeCipher:
    def __init__(self):
        self.forgotten = False

    def encrypt(self, plain):
        return {"iv": "aXY=", "data": base64.b64encode(plain[::-1]).decode("ascii")}

    def decrypt(self, record):
        return base64.b64decode(record["data"])[::-1]

    def forget(self):
        self.forgotten = True


def test_plain_store_round_trip_with_private_permissions(tmp_path):
    store = ApiKeyStore(str(tmp_path))
    assert store.load() == ""
    store.save("  plain-key  ")
    assert store.path.stat().st_mode & 0o777 == 0o600
    assert store.load() == "plain-key"
    store.delete()
    assert not store.path.exists()
    assert store.load() == ""


def test_encrypted_store_never_writes_plaintext(tmp_path):
    cipher = FakeCipher()
    store = ApiKeyStore(str(tmp_path), cipher)
    assert store.encrypted
    store.save("secret-value")
    text = store.path.read_text()
    assert "secret-value" not in text
    assert json.loads(text)["mode"] == "keystore"
    assert store.load() == "secret-value"
    store.delete()
    assert cipher.forgotten


def test_store_rejects_empty_corrupt_and_mismatched_records(tmp_path):
    store = ApiKeyStore(str(tmp_path))
    with pytest.raises(KeyStoreError):
        store.save("   ")
    store.path.write_text("{")
    with pytest.raises(KeyStoreError):
        store.load()
    store.path.write_text(json.dumps({"v": 1, "mode": "keystore", "iv": "", "data": ""}))
    with pytest.raises(KeyStoreError):
        store.load()
    encrypted = ApiKeyStore(str(tmp_path), FakeCipher())
    store.path.write_text(json.dumps({"v": 1, "mode": "plain", "key": "x"}))
    with pytest.raises(KeyStoreError):
        encrypted.load()


def test_java_byte_arrays_are_converted():
    assert _to_bytes(b"ab") == b"ab"
    assert _to_bytes([-1, 0, 65]) == bytes([255, 0, 65])
